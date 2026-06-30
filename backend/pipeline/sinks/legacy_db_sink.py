"""LegacyDbSink — the original write path, now behind the ItemSink seam.

Normalizes items (``content_hash`` dedup) and stores them in
``collected_records``, exactly as the pipeline did inline before the seam
existed. Extracting it changes no behavior: it still calls
``normalizer.normalize_items`` then ``storer.store_records`` inside a
short-lived session.

Two things stay where they were on purpose, to keep this slice behavior-only:
  * The ODP forward still lives inside ``storer.store_records`` (fires when
    ``ODP_INGEST_URL`` is set). It moves out to ``OdpSink`` / ``DualSink`` in a
    later slice, when ``write_strategy`` selects the destination.
  * Dedup here remains ``content_hash`` (title|url|content|source_id). The ODP
    path keys on ``(source_id, event_id)`` instead; the two will disagree, and
    surfacing that disagreement under shadow is the point of the migration.
"""

from __future__ import annotations

from typing import Sequence

from backend.pipeline.sinks.base import RunContext, SinkResult


class LegacyDbSink:
    """Persist collected items to the legacy ``collected_records`` table."""

    async def write_batch(self, ctx: RunContext, items: Sequence[dict]) -> SinkResult:
        # Function-local imports mirror the orchestrator: ``AsyncSessionLocal`` is
        # rebound per call so tests can patch ``backend.database.AsyncSessionLocal``,
        # and ``storer``/``normalizer`` are reached as module attributes so
        # ``patch("backend.pipeline.storer.store_records")`` takes effect.
        from backend.database import AsyncSessionLocal
        from backend.pipeline import normalizer, storer

        triples = normalizer.normalize_items(list(items), ctx.source_id)

        # TODO(PR3): storer.store_records still owns the ODP forward (see module
        # docstring). When OdpSink lands, add a forward_to_odp gate here so
        # DualSink(LegacyDbSink + OdpSink) cannot double-send to ODP.
        async with AsyncSessionLocal() as session:
            new_records, skipped = await storer.store_records(
                session, ctx.task_id, ctx.source_id, triples, channel_type=ctx.provider
            )
            await session.commit()

        return SinkResult(
            accepted=len(new_records),
            duplicates=skipped,
            normalized=len(triples),
            records=new_records,
        )
