"""Plan executor v1: the run body for degenerate (single-source) Plans
(issue 03, ADR-0009, docs/plan-ir-PRD.md story 10/13/14/18).

``run_plan_once`` is the NEW test seam this issue introduces — a plain
async function taking a session and a ``Plan`` row, directly invocable in
tests without any scheduler/asyncio-wrapper timing. Precedent: the Control
Cycle body (``backend.control.cycle.run_control_cycle_once``) — same shape,
same "inject session + explicit inputs, return a result dataclass" contract.

Scope (issue 03 only): a Plan whose graph is exactly one source node (a
"degenerate" Plan, ADR-0009 — every existing Data Source's plan-ir
projection is one of these). Executing it dispatches to the EXISTING
channel/runner machinery — ``backend.services.task_service.create_task`` +
``backend.pipeline.runner.run_collection_pipeline`` — the same two calls
``POST /api/v1/tasks/trigger`` (``backend.api.v1.tasks.trigger_task``) makes
today. This module does not reimplement task creation, pipeline dispatch,
TaskRun bookkeeping, or measurement/control-state recording: it drives the
same functions a direct source trigger drives, so the rows those functions
produce are — by construction, not by parallel re-implementation —
identical in shape to today's direct-trigger output (issue 03 acceptance
criterion / zero-regression hard assertion).

Multi-source (and shared-segment) Plans are refused here with a clear
error; that execution shape is issue 04's scope entirely, not a partial
implementation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.plan import Plan
from backend.schemas.plan_ir import PlanGraph
from backend.services import source_service, task_service


class PlanExecutionError(Exception):
    """Refusal to execute a Plan (draft / non-runnable / multi-source /
    missing source). Callers (the HTTP router) map this to a 4xx; the
    executor-seam tests assert on ``.args[0]`` directly."""


@dataclass
class PlanRunResult:
    """Everything one ``run_plan_once`` pass did — mirrors
    ``backend.control.cycle.CycleResult``'s role as the seam's return value
    for both tests and the HTTP router's response body."""

    plan_id: str
    source_id: str
    task_id: str
    run_id: Optional[str]
    success: bool
    collected: int
    stored: int
    skipped: int
    error: Optional[str]


def _source_nodes(graph: PlanGraph) -> list[Any]:
    return [n for n in graph.nodes if n.kind == "source"]


async def run_plan_once(
    session: AsyncSession,
    plan: Plan,
    *,
    parameters: Optional[dict] = None,
    priority: int = 5,
    agent_id: Optional[str] = None,
) -> PlanRunResult:
    """Run ``plan`` once, synchronously, to completion.

    Refuses (raises ``PlanExecutionError``) when:
    - ``plan.draft`` is True (an unmaterialized Draft Source Node is present
      — nothing safe to execute yet, PRD story 9/10).
    - ``plan.runnable`` is False (e.g. zero source nodes at all).
    - the graph's source-node count isn't exactly 1 (issue 03 is the
      degenerate-plan slice only; 0 or 2+ source nodes need issue 04's
      shared-segment executor).
    - the one source node's ``source_id`` doesn't resolve to an existing
      ``DataSource`` (dangling reference — same 404 semantics
      ``trigger_task`` applies today).

    On success, dispatches through the identical call pair
    ``trigger_task`` uses — ``task_service.create_task`` (trigger_type
    ``"plan"`` so a plan-triggered TaskRun's provenance is visible in the
    Run Inbox per PRD story 28, everything else about the row identical)
    then ``run_collection_pipeline`` — and awaits it directly (no
    fire-and-forget asyncio.create_task) so the seam is deterministic: the
    TaskRun/records this produces exist by the time this function returns.
    """
    if plan.draft:
        raise PlanExecutionError(f"Plan {plan.id!r} is draft and cannot be run.")
    if not plan.runnable:
        raise PlanExecutionError(f"Plan {plan.id!r} is not runnable.")

    graph = PlanGraph.model_validate(plan.graph)
    source_nodes = _source_nodes(graph)

    if len(source_nodes) != 1:
        raise PlanExecutionError(
            f"Plan {plan.id!r} has {len(source_nodes)} source node(s); the v1 "
            "executor only runs degenerate (single-source) Plans. Multi-source "
            "execution is issue 04's scope."
        )

    node = source_nodes[0]
    if not node.source_id:
        raise PlanExecutionError(
            f"Plan {plan.id!r} source node {node.id!r} has no source_id."
        )

    source = await source_service.get_source(session, node.source_id)
    if source is None:
        raise PlanExecutionError(
            f"Plan {plan.id!r} source node {node.id!r} references unknown "
            f"source {node.source_id!r}."
        )
    if not source.enabled:
        raise PlanExecutionError(
            f"Plan {plan.id!r} source {node.source_id!r} is disabled."
        )

    task = await task_service.create_task(
        session,
        source_id=source.id,
        trigger_type="plan",
        parameters=parameters or {},
        priority=priority,
        agent_id=agent_id,
    )
    # Commit before dispatching so run_collection_pipeline's own fresh
    # sessions (backend.database.AsyncSessionLocal) can see the new task row
    # — same ordering trigger_task uses (backend/api/v1/tasks.py).
    await session.commit()

    from backend.pipeline.runner import run_collection_pipeline

    outcome = await run_collection_pipeline(task.id, parameters or {})

    if "error" in outcome and "success" not in outcome:
        raise PlanExecutionError(
            f"Plan {plan.id!r} run failed before pipeline execution: {outcome['error']}"
        )

    return PlanRunResult(
        plan_id=plan.id,
        source_id=source.id,
        task_id=task.id,
        run_id=outcome.get("run_id"),
        success=bool(outcome.get("success")),
        collected=outcome.get("collected", 0),
        stored=outcome.get("stored", 0),
        skipped=outcome.get("skipped", 0),
        error=outcome.get("error"),
    )
