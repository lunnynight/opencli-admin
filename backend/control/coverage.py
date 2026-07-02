"""SensorCoverage: make sensor gaps visible (C0 — Control Room v0).

See docs/CONTROL_THEORY_ARCHITECTURE.md §0: "先让系统诚实" — a controller built
on lying sensors is worse than no controller. Before PR-Control-3's real
evaluator/policies engine can be trusted, the system must be honest about
*which* sensor readings it actually has versus which are placeholders.

This module adds NO sensors and reads NO new data. It only inspects a
:class:`backend.control.measurements.SourceMeasurement` that
``backend.control.aggregation.build_measurement`` already produced, and reports
which of the five signals that PR-Control-3+ will depend on are real:

    run          — do we have run evidence at all? (always True here: this
                   module is only called once a measurement exists — a `None`
                   measurement is a separate "never ran" case the endpoint
                   already handles.)
    cursor       — is cursor advancement a real observed signal, or the
                   ``cursor_advanced=False`` placeholder aggregation.py hardcodes
                   (see aggregation.py's own comment: "no boolean is persisted
                   per-run today ... report a conservative False")?
    freshness    — is ``freshness_lag_seconds`` populated, or is it the
                   unconditional ``None`` aggregation.py leaves it as?
    error_kinds  — has any failure been classified into a taxonomy (transient /
                   permanent / auth / rate_limit / schema_drift / backpressure /
                   poison_message per docs §2 principle 6)? Not recorded on
                   SourceMeasurement at all yet, so always False today.
    odp          — are the ODP metrics (odp_stream_lag / odp_pending / dlq_count
                   beyond its int default) populated, or the ``None`` /
                   zero-default aggregation.py leaves them as (cross-service
                   call out of scope for PR-Control-2)?

Because ``cursor_advanced`` is a required non-Optional bool (always `False` or
`True`), and every existing call site sets it to a hardcoded `False` rather
than a real observation, we cannot ask "is it None" as the honesty check for
that one field. Instead cursor coverage is a structural constant today
(``False``) — flip it only once a caller threads a genuinely observed value
through (tracked as PR-Control-3+ work in aggregation.py's own comment).
"""

from typing import TypedDict

from backend.control.measurements import SourceMeasurement

# Signals PR-Control-3+ needs to trust an automatic (non-advisory) decision.
# error_kinds isn't a SourceMeasurement field yet (not recorded anywhere) —
# treated as a structural gap, not a per-measurement check.
_CRITICAL_SIGNALS = ("odp", "error_kinds")


class SensorCoverage(TypedDict):
    run: bool
    cursor: bool
    freshness: bool
    error_kinds: bool
    odp: bool


def compute_sensor_coverage(measurement: SourceMeasurement) -> SensorCoverage:
    """Which sensor signals behind ``measurement`` are real vs. placeholder.

    Read-only inspection of fields already on ``measurement`` — adds no new
    sensor, calls no new source. A measurement is only ever built once a
    source has run (see ``aggregation.build_measurement``), so ``run`` is
    always True in this function's contract; the "never ran" case is handled
    by the endpoint returning ``measurement=None`` before this is called.
    """
    return SensorCoverage(
        run=True,
        # aggregation.py hardcodes cursor_advanced=False as a "no real signal
        # exists yet" placeholder (its own comment) — until a caller threads a
        # genuinely observed value through, cursor coverage is structurally
        # absent regardless of the field's boolean value.
        cursor=False,
        freshness=measurement.freshness_lag_seconds is not None,
        # Not a SourceMeasurement field yet — no failure taxonomy is recorded
        # anywhere in the pipeline today (docs §2 principle 6 is future work).
        error_kinds=False,
        odp=measurement.odp_stream_lag is not None or measurement.odp_pending is not None,
    )


def missing_signals(coverage: SensorCoverage) -> list[str]:
    """The (stably ordered) list of signal names that are False in coverage."""
    return [name for name, present in coverage.items() if not present]


def derive_confidence(coverage: SensorCoverage) -> str:
    """"high" | "medium" | "low" confidence in the coverage, per C0 contract.

        low    — any critical signal (odp, error_kinds) is missing, OR two or
                 more signals overall are missing. A state derived from this
                 little evidence must never be reported as a confident HEALTHY.
        medium — exactly one non-critical signal is missing.
        high   — every signal is present.

    This function only classifies coverage; it does not decide control_state
    (see backend.control.evaluator for how confidence gates HEALTHY).
    """
    missing = missing_signals(coverage)
    if not missing:
        return "high"
    if any(signal in missing for signal in _CRITICAL_SIGNALS):
        return "low"
    if len(missing) >= 2:
        return "low"
    return "medium"
