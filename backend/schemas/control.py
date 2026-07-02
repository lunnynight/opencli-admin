"""Response schemas for the read-only, advisory control-state endpoint
(PR-Control-3, building on PR-Control-2 + C0 Control Room v0).

PINNED CONTRACT: ``SourceControlStateRead`` is the exact response shape the
frontend agent builds against in parallel — field names and nesting must not
change without both sides agreeing. See the PR-Control-3 task brief for the
authoritative JSON shape.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from backend.control.coverage import SensorCoverage
from backend.control.measurements import SourceMeasurement
from backend.control.models import SourceControlState
from backend.control.objectives import SourceObjective


class TrendRead(BaseModel):
    """Rolling-window summary over a source's recent source_measurements rows.

    Null on the parent response when the source has no persisted
    source_measurements row yet (nothing to trend over) — see
    ``backend.control.aggregation.build_trend``.
    """

    window: int
    zero_accepted_streak: int
    avg_error_rate: float
    rate_limited_runs: int


class SystemContextRead(BaseModel):
    """Shared-infrastructure signals distinct from any one source's own
    measurement — the ODP data plane's backpressure state, as classified by
    comparing ``backend.control.collectors.odp_metrics`` against the source's
    objective.

    ``available=False`` means the ODP collector itself could not be reached
    (down Redis, unreachable odp-ingest, etc — see odp_metrics.collect()'s
    per-section degrade-not-raise contract); in that case
    ``odp_backpressured`` is always False (never fabricated as True) and
    ``stream_lag``/``pending`` are None.
    """

    odp_backpressured: bool
    stream_lag: Optional[int] = None
    pending: Optional[int] = None
    available: bool


class SuggestedActionRead(BaseModel):
    """One advisory suggestion — see backend.control.policies.suggest_actions.

    ADVISORY ONLY: nothing in this PR executes these. Surfacing them is the
    entire scope of PR-Control-3; PR-Control-4 (actuators.py) is a later PR
    that would read suggestions like these and (gated by
    Settings.control_mode == "automatic") actually perform them.
    """

    action_type: str
    reason: str
    payload: dict[str, Any] = Field(default_factory=dict)


class SourceControlStateRead(BaseModel):
    """Read-only, advisory control view of a source.

    ``measurement``/``control_state``/``confidence``/``sensor_coverage``/
    ``trend`` are null when the source has never run (no run evidence to
    aggregate, nothing to evaluate, nothing to trend). ``objective`` is
    always the setpoints the measurement was (or would be) compared against
    — per-source objective overrides are not stored yet (future work).

    ``system_context`` is always present (never null) — it reflects the
    shared ODP data plane's state, which exists independent of whether this
    particular source has ever run.

    ``suggested_actions`` is always a list (possibly empty) — advisory
    ControlAction suggestions from ``backend.control.policies``. Empty means
    "the policy engine has nothing to suggest for this state", not "unknown".

    ``control_mode`` mirrors ``Settings.control_mode`` — "advisory" today.
    Even when set to "automatic", THIS ENDPOINT NEVER EXECUTES ANYTHING; that
    field only signals what a future actuator PR would be allowed to do.
    """

    source_id: str
    control_state: Optional[SourceControlState] = None
    confidence: Optional[str] = None
    sensor_coverage: Optional[SensorCoverage] = None
    missing_signals: list[str] = Field(default_factory=list)
    measurement: Optional[SourceMeasurement] = None
    objective: SourceObjective
    trend: Optional[TrendRead] = None
    system_context: SystemContextRead
    suggested_actions: list[SuggestedActionRead] = Field(default_factory=list)
    control_mode: str
