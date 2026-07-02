"""DBCursorStore — per-source cursor persisted in source_cursors, upserted on save."""

import asyncio
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.pipeline.cursor_store import DBCursorStore


def _sessionmaker(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.mark.asyncio
async def test_load_missing_returns_none(db_engine):
    with patch("backend.database.AsyncSessionLocal", _sessionmaker(db_engine)):
        assert await DBCursorStore().load("nope") is None


@pytest.mark.asyncio
async def test_save_then_load_roundtrip(db_engine):
    with patch("backend.database.AsyncSessionLocal", _sessionmaker(db_engine)):
        store = DBCursorStore()
        await store.save("src-1", {"etag": "abc"})
        assert await store.load("src-1") == {"etag": "abc"}


@pytest.mark.asyncio
async def test_save_upserts_one_row_per_source(db_engine):
    with patch("backend.database.AsyncSessionLocal", _sessionmaker(db_engine)):
        store = DBCursorStore()
        await store.save("src-1", {"etag": "v1"})
        await store.save("src-1", {"etag": "v2", "last_modified": "Wed"})
        assert await store.load("src-1") == {"etag": "v2", "last_modified": "Wed"}


@pytest.mark.asyncio
async def test_cursors_isolated_by_source(db_engine):
    with patch("backend.database.AsyncSessionLocal", _sessionmaker(db_engine)):
        store = DBCursorStore()
        await store.save("src-1", {"etag": "a"})
        assert await store.load("src-2") is None


# ── P1-6: concurrent saves for the same source must not lose an update ─────

@pytest.mark.asyncio
async def test_concurrent_saves_no_lost_update_existing_row(db_engine):
    """Two concurrent save() calls updating an already-existing cursor row
    (the common case: a source that has collected before) must both land
    without raising, and the final value must be one of the two writers' —
    never the pre-race seed value, which would mean an update silently
    vanished into a stale overwrite."""
    with patch("backend.database.AsyncSessionLocal", _sessionmaker(db_engine)):
        store = DBCursorStore()
        await store.save("src-1", {"etag": "seed"})

        results = await asyncio.gather(
            store.save("src-1", {"etag": "from-A"}),
            store.save("src-1", {"etag": "from-B"}),
            return_exceptions=True,
        )

        # Neither concurrent save should raise.
        assert results == [None, None]

        final = await store.load("src-1")
        # The lost-update bug this guards against: final == the seed value
        # (meaning both concurrent writers' updates were discarded) or a
        # value from neither writer. One of the two concurrent writers must
        # have durably landed.
        assert final in ({"etag": "from-A"}, {"etag": "from-B"})


@pytest.mark.asyncio
async def test_concurrent_saves_no_lost_update_first_insert_race(db_engine):
    """Two concurrent save() calls for a brand-new source (no row yet) race
    on the first INSERT. The loser must fall back to an update instead of
    raising IntegrityError out to the caller, and the source must end up
    with exactly one row holding one of the two writers' values — not two
    rows, not an unhandled exception, not a silently dropped write."""
    with patch("backend.database.AsyncSessionLocal", _sessionmaker(db_engine)):
        store = DBCursorStore()

        results = await asyncio.gather(
            store.save("src-new", {"etag": "from-A"}),
            store.save("src-new", {"etag": "from-B"}),
            return_exceptions=True,
        )

        assert results == [None, None]

        final = await store.load("src-new")
        assert final in ({"etag": "from-A"}, {"etag": "from-B"})
