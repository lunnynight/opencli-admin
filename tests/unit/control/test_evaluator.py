"""Unit tests for the PR-Control-2 provisional evaluator + C0 honesty gate.

Only the minimal placeholder logic is exercised here; PR-Control-3 replaces
backend.control.evaluator with the real rule-based engine.

C0 (Control Room v0, docs/CONTROL_THEORY_ARCHITECTURE.md §0): a source cannot
render as a confident HEALTHY when sensor coverage is incomplete. Since
`_measurement()` below leaves odp/freshness/cursor unpopulated by default (the
same as real aggregation.py output today), the "would-be-healthy" tests below
assert UNKNOWN unless the test explicitly fills in full coverage.
"""

from datetime import datetime, timezone

from backend.control.evaluator import evaluate
from backend.control.measurements import SourceMeasurement
from backend.control.models import SourceControlState
from backend.control.objectives import SourceObjective


def _measurement(**overrides) -> SourceMeasurement:
    kwargs = dict(
        source_id="src-1",
        run_id="run-1",
        accepted=10,
        duplicates=0,
        rejected=0,
        fetch_latency_ms=100,
        error_rate=0.0,
        duplicate_rate=0.0,
        cursor_advanced=False,
        observed_at=datetime(2026, 7, 2, tzinfo=timezone.utc),
    )
    kwargs.update(overrides)
    return SourceMeasurement(**kwargs)


class TestEvaluate:
    def test_low_coverage_default_is_unknown_not_healthy(self):
        # Nothing looks wrong, but odp/error_kinds coverage is missing (the
        # real aggregation.py default) -> confidence "low" -> UNKNOWN, never
        # a fake HEALTHY.
        m = _measurement()
        assert evaluate(m, SourceObjective()) is SourceControlState.UNKNOWN

    def test_healthy_is_unreachable_until_error_kinds_and_cursor_are_wired(self):
        # error_kinds has no SourceMeasurement field at all yet (always missing)
        # and cursor is a structural constant (coverage.py never reports it as
        # present) — so even with freshness+odp fully populated, two signals
        # (one critical: error_kinds) are always missing -> "low" -> UNKNOWN.
        # This is intentional: C0 must not invent a HEALTHY path the real
        # sensors can't back up yet. PR-Control-3+ makes HEALTHY reachable once
        # error_kinds/cursor land as real signals.
        m = _measurement(freshness_lag_seconds=5, odp_pending=0, odp_stream_lag=0)
        assert evaluate(m, SourceObjective()) is SourceControlState.UNKNOWN

    def test_degraded_when_error_rate_exceeds_objective(self):
        # default max_error_rate = 0.05 — DEGRADED is positive evidence, never
        # gated by coverage (even with low coverage it must surface, not hide).
        m = _measurement(rejected=1, accepted=1, error_rate=0.5)
        assert evaluate(m, SourceObjective()) is SourceControlState.DEGRADED

    def test_error_rate_at_setpoint_is_not_degraded(self):
        # strictly-greater comparison: equal to setpoint does not trip DEGRADED,
        # but low coverage still gates the fallthrough to UNKNOWN.
        m = _measurement(error_rate=0.05)
        assert evaluate(m, SourceObjective(max_error_rate=0.05)) is SourceControlState.UNKNOWN

    def test_backpressured_when_odp_pending_exceeds_max_pending(self):
        m = _measurement(odp_pending=5000)
        obj = SourceObjective(max_pending=1000)
        assert evaluate(m, obj) is SourceControlState.BACKPRESSURED

    def test_none_odp_pending_never_backpressured(self):
        # PR-Control-2 leaves odp_pending unpopulated (None) — that branch can't
        # fire, and the fallthrough is gated to UNKNOWN by low coverage.
        m = _measurement(odp_pending=None)
        assert evaluate(m, SourceObjective()) is SourceControlState.UNKNOWN

    def test_degraded_takes_precedence_over_backpressure(self):
        m = _measurement(error_rate=0.9, odp_pending=99999)
        assert evaluate(m, SourceObjective()) is SourceControlState.DEGRADED

    def test_healthy_passes_through_once_coverage_is_not_low(self, monkeypatch):
        # Isolates the evaluator's gate from coverage.py's specific signal
        # semantics: once PR-Control-3+ wires up error_kinds/cursor such that
        # derive_confidence can return "medium"/"high", HEALTHY must pass
        # through unmodified. Patch derive_confidence at its evaluator
        # import site so this test doesn't depend on which signals compute.py
        # currently considers present.
        import backend.control.evaluator as evaluator_module

        monkeypatch.setattr(evaluator_module, "derive_confidence", lambda _cov: "medium")
        m = _measurement()
        assert evaluate(m, SourceObjective()) is SourceControlState.HEALTHY

    def test_unknown_only_when_confidence_is_low(self, monkeypatch):
        import backend.control.evaluator as evaluator_module

        monkeypatch.setattr(evaluator_module, "derive_confidence", lambda _cov: "high")
        m = _measurement()
        assert evaluate(m, SourceObjective()) is SourceControlState.HEALTHY
