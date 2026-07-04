"""Compile Canvas WorkflowProject documents into executable-plan previews."""

from collections import Counter, defaultdict, deque
from typing import Literal

from backend.schemas.plan_ir import PlanEdge, PlanGraph, PlanNode, PlanPort
from backend.schemas.workflow import (
    CompiledWorkflowAdapterBinding,
    CompiledWorkflowEdge,
    CompiledWorkflowNode,
    WorkflowAdapterBinding,
    WorkflowAuthoringMetadata,
    WorkflowCompiledPlanPreview,
    WorkflowCompileError,
    WorkflowCompileResponse,
    WorkflowProject,
    WorkflowProjectNode,
    WorkflowRuntimePreview,
)


def compile_workflow_project(project: WorkflowProject) -> WorkflowCompileResponse:
    """Validate and compile a WorkflowProject without dispatching execution."""

    errors = _validate_project(project)
    if errors:
        return WorkflowCompileResponse(valid=False, errors=errors, plan=None)

    adapter_by_id = {adapter.id: adapter for adapter in project.adapters}
    depends_on = _dependency_map(project)
    compiled_nodes = [
        _compile_node(node, adapter_by_id.get(node.adapter or ""), depends_on[node.id])
        for node in project.nodes
    ]
    compiled_edges = [
        CompiledWorkflowEdge(
            id=edge.id,
            source=edge.source,
            target=edge.target,
            sourcePort=edge.sourcePort or "records",
            targetPort=edge.targetPort or "records",
            contractId=edge.contractId,
            condition=edge.condition,
        )
        for edge in project.edges
    ]
    plan_ir = _to_plan_ir(project)

    return WorkflowCompileResponse(
        valid=True,
        errors=[],
        plan=WorkflowCompiledPlanPreview(
            authoring=WorkflowAuthoringMetadata(
                project_id=project.id,
                project_name=project.name,
                project_version=project.version,
                profile=project.profile,
                node_count=len(project.nodes),
                edge_count=len(project.edges),
                adapter_count=len(project.adapters),
                settings=project.settings,
                agentPermissions=project.agentPermissions,
            ),
            runtime=WorkflowRuntimePreview(
                node_ids=[node.id for node in project.nodes],
                nodes=compiled_nodes,
                edges=compiled_edges,
                plan_ir=plan_ir,
            ),
        ),
    )


def _validate_project(project: WorkflowProject) -> list[WorkflowCompileError]:
    errors: list[WorkflowCompileError] = []
    node_counts = Counter(node.id for node in project.nodes)
    duplicate_nodes = {node_id for node_id, count in node_counts.items() if count > 1}
    for node_id in sorted(duplicate_nodes):
        errors.append(
            WorkflowCompileError(
                code="duplicate_node_id",
                message=f'Workflow node id "{node_id}" is duplicated',
                node_id=node_id,
                path=["nodes"],
            )
        )

    edge_counts = Counter(edge.id for edge in project.edges)
    for edge_id, count in sorted(edge_counts.items()):
        if count > 1:
            errors.append(
                WorkflowCompileError(
                    code="duplicate_edge_id",
                    message=f'Workflow edge id "{edge_id}" is duplicated',
                    edge_id=edge_id,
                    path=["edges"],
                )
            )

    node_ids = {node.id for node in project.nodes}
    adapter_by_id = {adapter.id: adapter for adapter in project.adapters}
    for edge in project.edges:
        if edge.source not in node_ids:
            errors.append(
                WorkflowCompileError(
                    code="missing_edge_source",
                    message=f'Workflow edge "{edge.id}" references missing source "{edge.source}"',
                    edge_id=edge.id,
                    path=["edges", edge.id, "source"],
                )
            )
        if edge.target not in node_ids:
            errors.append(
                WorkflowCompileError(
                    code="missing_edge_target",
                    message=f'Workflow edge "{edge.id}" references missing target "{edge.target}"',
                    edge_id=edge.id,
                    path=["edges", edge.id, "target"],
                )
            )

    for node in project.nodes:
        if node.adapter and node.adapter not in adapter_by_id:
            errors.append(
                WorkflowCompileError(
                    code="missing_adapter_binding",
                    message=(
                        f'Workflow node "{node.id}" references missing adapter '
                        f'"{node.adapter}"'
                    ),
                    node_id=node.id,
                    path=["nodes", node.id, "adapter"],
                )
            )
        elif _requires_adapter(node) and not node.adapter:
            errors.append(
                WorkflowCompileError(
                    code="missing_adapter_binding",
                    message=f'Workflow node "{node.id}" requires an adapter binding',
                    node_id=node.id,
                    path=["nodes", node.id, "adapter"],
                )
            )

    errors.extend(_cycle_errors(project))
    return errors


def _requires_adapter(node: WorkflowProjectNode) -> bool:
    return node.kind == "source" or node.capability in {"fetch", "send"}


def _cycle_errors(project: WorkflowProject) -> list[WorkflowCompileError]:
    node_ids = [node.id for node in project.nodes]
    indegree = {node_id: 0 for node_id in node_ids}
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in project.edges:
        if edge.source in indegree and edge.target in indegree:
            adjacency[edge.source].append(edge.target)
            indegree[edge.target] += 1

    queue = deque([node_id for node_id, degree in indegree.items() if degree == 0])
    visited: set[str] = set()
    while queue:
        node_id = queue.popleft()
        visited.add(node_id)
        for target in adjacency[node_id]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    cycle_node_ids = sorted(set(node_ids) - visited)
    return [
        WorkflowCompileError(
            code="cycle",
            message=f'Workflow graph contains a cycle at node "{node_id}"',
            node_id=node_id,
            path=["nodes", node_id],
        )
        for node_id in cycle_node_ids
    ]


def _dependency_map(project: WorkflowProject) -> dict[str, list[str]]:
    upstream: dict[str, list[str]] = {node.id: [] for node in project.nodes}
    for edge in project.edges:
        upstream[edge.target].append(edge.source)
    return upstream


def _compile_node(
    node: WorkflowProjectNode,
    adapter: WorkflowAdapterBinding | None,
    depends_on: list[str],
) -> CompiledWorkflowNode:
    package_metadata = None
    if node.topicCollapse or node.miniNetwork:
        package_metadata = {
            "miniNetwork": node.miniNetwork.model_dump() if node.miniNetwork else None,
            "topicCollapse": node.topicCollapse.model_dump() if node.topicCollapse else None,
            "locked": node.topicCollapse.mode == "locked" if node.topicCollapse else False,
        }

    return CompiledWorkflowNode(
        id=node.id,
        kind=node.kind,
        capability=node.capability,
        params=node.params,
        depends_on=depends_on,
        adapter=(
            CompiledWorkflowAdapterBinding(
                id=adapter.id,
                type=adapter.type,
                provider=adapter.provider,
                mode=adapter.mode,
                config=adapter.config,
            )
            if adapter
            else None
        ),
        sourceAnchor=node.sourceAnchor,
        runArtifact=node.runArtifact,
        package=package_metadata,
        runtime={
            "node_id": node.id,
            "status_anchor": node.id,
            "capability": node.capability,
            "dispatch": "preview",
        },
    )


def _to_plan_ir(project: WorkflowProject) -> PlanGraph:
    return PlanGraph(
        name=project.name,
        draft=True,
        nodes=[_to_plan_node(node) for node in project.nodes],
        edges=[
            PlanEdge(
                id=edge.id,
                source_node=edge.source,
                source_port=edge.sourcePort or "records",
                target_node=edge.target,
                target_port=edge.targetPort or "records",
            )
            for edge in project.edges
        ],
    )


def _to_plan_node(node: WorkflowProjectNode) -> PlanNode:
    kind: Literal["source", "transform", "merge", "sink"]
    if node.kind in {"schedule", "source"}:
        kind = "source"
    elif node.kind in {"notify", "inbox"}:
        kind = "sink"
    else:
        kind = "transform"
    return PlanNode(
        id=node.id,
        kind=kind,
        type=f"workflow.{node.kind}.{node.capability}",
        label=node.id,
        params={
            **node.params,
            "workflow": {
                "kind": node.kind,
                "capability": node.capability,
                "adapter": node.adapter,
            },
        },
        inputs=[] if kind == "source" else [PlanPort(name="records", type="records")],
        outputs=[] if kind == "sink" else [PlanPort(name="records", type="records")],
        source_id=None,
        draft=kind == "source",
    )
