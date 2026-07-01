"""write_strategy -> sink selection. The state machine that routes the write.

Default/unknown collapses to legacy (behavior-preserving); the odp_* states pick
DualSink/OdpSink with the right require_odp posture and no double-send.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.pipeline.sinks import DualSink, LegacyDbSink, OdpSink, SinkResult
from backend.pipeline.sinks.strategy import select_sink


def test_legacy_keeps_env_shadow():
    s = select_sink("legacy")
    assert isinstance(s, LegacyDbSink)
    # legacy preserves the original env-gated forward (forward_to_odp=True).
    assert s.forward_to_odp is True


def test_none_falls_back_to_legacy():
    assert isinstance(select_sink(None), LegacyDbSink)


def test_unknown_falls_back_to_legacy():
    assert isinstance(select_sink("bogus"), LegacyDbSink)


def test_odp_shadow_is_best_effort_dual():
    s = select_sink("odp_shadow")
    assert isinstance(s, DualSink)
    assert s.require_odp is False
    assert isinstance(s.legacy, LegacyDbSink)
    # No double-send: the legacy leg does not forward; OdpSink is the sole sender.
    assert s.legacy.forward_to_odp is False
    assert isinstance(s.odp, OdpSink)


def test_odp_dual_required_requires_odp():
    s = select_sink("odp_dual_required")
    assert isinstance(s, DualSink)
    assert s.require_odp is True


def test_odp_primary_requires_odp():
    s = select_sink("odp_primary")
    assert isinstance(s, DualSink)
    assert s.require_odp is True


def test_odp_only_is_forward_only():
    assert isinstance(select_sink("odp_only"), OdpSink)


@pytest.mark.asyncio
async def test_run_pipeline_selects_sink_by_strategy(db_session):
    """Without an injected sink, run_pipeline routes through select_sink(strategy)."""
    from backend.channels.base import ChannelResult
    from backend.models.source import DataSource
    from backend.models.task import CollectionTask
    from backend.pipeline.pipeline import run_pipeline

    source = DataSource(
        name="Strategy Source",
        channel_type="rss",
        channel_config={"feed_url": "https://x/f"},
        write_strategy="odp_only",
    )
    db_session.add(source)
    await db_session.flush()
    task = CollectionTask(source_id=source.id, trigger_type="manual", parameters={})
    db_session.add(task)
    await db_session.flush()

    fake = MagicMock()
    fake.write_batch = AsyncMock(return_value=SinkResult(accepted=1, records=[MagicMock()]))

    with (
        patch("backend.pipeline.collector.collect", return_value=ChannelResult.ok([{"title": "x"}])),
        patch("backend.pipeline.sinks.strategy.select_sink", return_value=fake) as sel,
    ):
        result = await run_pipeline(
            task.id, source, enable_ai=False, enable_notifications=False
        )

    sel.assert_called_once_with("odp_only")
    fake.write_batch.assert_awaited_once()
    assert result.success is True


@pytest.mark.asyncio
async def test_run_pipeline_injected_sink_overrides_strategy(db_session):
    """An explicitly injected sink wins over write_strategy selection."""
    from backend.channels.base import ChannelResult
    from backend.models.source import DataSource
    from backend.models.task import CollectionTask
    from backend.pipeline.pipeline import run_pipeline

    source = DataSource(
        name="Override Source",
        channel_type="rss",
        channel_config={"feed_url": "https://x/f"},
        write_strategy="odp_only",
    )
    db_session.add(source)
    await db_session.flush()
    task = CollectionTask(source_id=source.id, trigger_type="manual", parameters={})
    db_session.add(task)
    await db_session.flush()

    injected = MagicMock()
    injected.write_batch = AsyncMock(return_value=SinkResult(accepted=0, records=[]))

    with (
        patch("backend.pipeline.collector.collect", return_value=ChannelResult.ok([{"title": "x"}])),
        patch("backend.pipeline.sinks.strategy.select_sink") as sel,
    ):
        await run_pipeline(
            task.id, source, enable_ai=False, enable_notifications=False, sink=injected
        )

    sel.assert_not_called()
    injected.write_batch.assert_awaited_once()
