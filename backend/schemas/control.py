"""Response schemas for the read-only control-state endpoint (PR-Control-2 +
C0 Control Room v0 sensor-honesty enrichment)."""

from typing import Optional

from pydantic import BaseModel, Field

from backend.control.coverage import SensorCoverage
from backend.control.measurements import SourceMeasurement
from backend.control.models import SourceControlState
from backend.control.objectives import SourceObjective


class SourceControlStateRead(BaseModel):
    """Read-only view of a source's latest sensor reading + derived state.

    ``measurement`` and ``control_state`` are null when the source has never run
    (no run evidence to aggregate, nothing to evaluate). ``objective`` is always
    the setpoints the measurement was (or would be) compared against — for
    PR-Control-2 this is the :class:`SourceObjective` defaults, since per-source
    objective overrides are not stored yet (future work).

    C0 additions (see docs/CONTROL_THEORY_ARCHITECTURE.md §0 +
    backend.control.coverage): ``confidence`` / ``sensor_coverage`` /
    ``missing_signals`` make the sensor gaps behind ``control_state`` visible to
    the UI, so an incomplete-sensor system can never render as a confident
    HEALTHY. All three are null exactly when ``measurement`` is null (no
    measurement -> nothing to compute coverage from).
    """

    source_id: str
    measurement: Optional[SourceMeasurement] = None
    control_state: Optional[SourceControlState] = None
    objective: SourceObjective
    confidence: Optional[str] = None
    sensor_coverage: Optional[SensorCoverage] = None
    missing_signals: list[str] = Field(default_factory=list)
