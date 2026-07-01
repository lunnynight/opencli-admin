"""write_strategy -> ItemSink. The state machine that picks a write destination.

Once a source declares an explicit strategy, the ODP forward is no longer an
implicit env-var side effect buried in the legacy path — it is chosen here. The
default ``legacy`` preserves today's behavior exactly (``LegacyDbSink`` with its
env-gated shadow-forward still intact); every other strategy makes the ODP write
explicit via ``OdpSink`` / ``DualSink`` and turns the storer's own forward off so
nothing double-sends.
"""

from __future__ import annotations

import logging

from backend.pipeline.sinks.base import ItemSink
from backend.pipeline.sinks.dual_sink import DualSink
from backend.pipeline.sinks.legacy_db_sink import LegacyDbSink
from backend.pipeline.sinks.odp_sink import OdpSink

logger = logging.getLogger(__name__)

LEGACY = "legacy"
ODP_SHADOW = "odp_shadow"
ODP_DUAL_REQUIRED = "odp_dual_required"
ODP_PRIMARY = "odp_primary"
ODP_ONLY = "odp_only"

WRITE_STRATEGIES = frozenset(
    {LEGACY, ODP_SHADOW, ODP_DUAL_REQUIRED, ODP_PRIMARY, ODP_ONLY}
)


def select_sink(strategy: str | None) -> ItemSink:
    """Map a source's ``write_strategy`` to a sink instance.

    Migration states:
      * ``legacy``            — DB write + the original env-gated ODP shadow.
      * ``odp_shadow``        — DB authoritative + ODP best-effort, forwarded once.
      * ``odp_dual_required`` — DB + ODP, ODP failure is surfaced (invariant).
      * ``odp_primary``       — DB + ODP required; ODP is the read source of truth
        (a cutover marker). Read-routing is outside the write pipeline, so the
        write path equals ``odp_dual_required`` for now.
      * ``odp_only``          — ODP only, no DB row.

    Unknown/None falls back to ``legacy`` (safe default) with a warning.
    """
    if strategy == ODP_ONLY:
        return OdpSink()
    if strategy == ODP_SHADOW:
        return DualSink(require_odp=False)
    if strategy in (ODP_DUAL_REQUIRED, ODP_PRIMARY):
        return DualSink(require_odp=True)
    if strategy not in (None, LEGACY):
        logger.warning("unknown write_strategy %r — falling back to legacy", strategy)
    return LegacyDbSink()
