"""Pipeline Step 1: Dispatch to the appropriate channel."""

from typing import Any

from backend.channels.base import ChannelResult
from backend.channels.registry import get_channel
from backend.models.source import DataSource


async def collect(source: DataSource, parameters: dict[str, Any]) -> ChannelResult:
    """Dispatch collection to the registered channel for the given source.

    Incremental channels (``capabilities.incremental``) collect through the thick
    runner so they resume from a persisted cursor; every other channel keeps the
    one-shot ``collect()`` path, unchanged.
    """
    channel = get_channel(source.channel_type)
    if channel.capabilities.incremental:
        return await _collect_incremental(source, parameters, channel)
    return await channel.collect(source.channel_config, parameters)


async def _collect_incremental(
    source: DataSource, parameters: dict[str, Any], channel: Any
) -> ChannelResult:
    """Collect an incremental channel via ``run_channel``, staging the cursor.

    The persisted cursor seeds the conditional fetch, but the advanced value is
    held in an in-memory staging store and returned in ``metadata['cursor_pending']``
    — the pipeline commits it to the DB only after the write sink durably accepts
    the batch, so the cursor never advances past data that did not land.
    """
    from backend.pipeline.channel_runner import run_channel
    from backend.pipeline.cursor_store import DBCursorStore, InMemoryCursorStore

    db_cursor = DBCursorStore()
    staging = InMemoryCursorStore()
    start = await db_cursor.load(source.id)
    if start is not None:
        await staging.save(source.id, start)

    items = await run_channel(source, parameters, cursor_store=staging, channel=channel)
    staged = await staging.load(source.id)

    return ChannelResult.ok(
        items,
        cursor_pending=staged,
        cursor_source_id=source.id,
    )
