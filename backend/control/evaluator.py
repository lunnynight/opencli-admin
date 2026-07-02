"""Provisional control-state derivation (PR-Control-2 placeholder + C0 honesty gate).

⚠️ MINIMAL BY DESIGN. This is NOT the real evaluator. PR-Control-3 replaces this
with the full rule-based ``evaluator`` + ``policies`` engine described in
docs/CONTROL_THEORY_ARCHITECTURE.md §4-5 (rich state detection —
RATE_LIMITED / AUTH_FAILED / SCHEMA_DRIFT / DEAD — plus ControlActions).

For PR-Control-2 we only need the endpoint to be able to return *a*
:class:`SourceControlState` for the obvious cases, so it compares one
:class:`SourceMeasurement` against one :class:`SourceObjective` and maps:

    error_rate  > objective.max_error_rate  -> DEGRADED
    odp_pending > objective.max_pending      -> BACKPRESSURED
    otherwise                                -> HEALTHY (gated — see below)

C0 (Control Room v0) adds one hard rule on top, per docs §0 ("先让系统诚实" — a
controller built on lying sensors is worse than none): **this evaluator must
never return a confident HEALTHY when the sensors behind that verdict are
incomplete.** Concretely:

    confidence == "low"  -> HEALTHY is remapped to UNKNOWN
    confidence in {"medium", "high"} -> HEALTHY passes through unchanged

DEGRADED/BACKPRESSURED are never remapped — those are *positive* evidence of a
problem (an observed error_rate or odp_pending crossing a setpoint), and
downgrading a real problem to UNKNOWN would hide it, which is the opposite of
the honesty goal. Only the "everything looks fine" verdict is untrustworthy
when the sensors that would have caught a problem (odp / error_kinds / cursor /
freshness) are not actually wired up — so only HEALTHY is gated.

confidence/coverage come from :mod:`backend.control.coverage`, which classifies
the *same* measurement this function already receives — it adds no new sensor
reads. See that module for the exact "high"/"medium"/"low" derivation.
"""

from backend.control.coverage import compute_sensor_coverage, derive_confidence
from backend.control.measurements import SourceMeasurement
from backend.control.models import SourceControlState
from backend.control.objectives import SourceObjective


def evaluate(
    measurement: SourceMeasurement, objective: SourceObjective
) -> SourceControlState:
    """Derive a provisional :class:`SourceControlState` (PR-Control-2 placeholder).

    PR-Control-3 will replace this with the real rule-based evaluator/policies.
    C0 adds the honesty gate documented at module level: HEALTHY only survives
    when sensor coverage is not "low" confidence.
    """
    # DEGRADED: rejects exceed the allowed error setpoint. This is a real,
    # positive signal (we observed rejects) — never gated by coverage.
    if measurement.error_rate > objective.max_error_rate:
        return SourceControlState.DEGRADED

    # BACKPRESSURED: too many items pending downstream. Guarded on odp_pending
    # being present — PR-Control-2 leaves it None (no ODP-side source), so in
    # practice this branch can only fire once ODP metrics are wired in later.
    if (
        measurement.odp_pending is not None
        and measurement.odp_pending > objective.max_pending
    ):
        return SourceControlState.BACKPRESSURED

    # Nothing looked wrong — but "nothing looked wrong" is only meaningful if
    # the sensors that would have caught a problem are actually present. If
    # coverage confidence is low, report UNKNOWN instead of a fake HEALTHY.
    coverage = compute_sensor_coverage(measurement)
    if derive_confidence(coverage) == "low":
        return SourceControlState.UNKNOWN

    return SourceControlState.HEALTHY
