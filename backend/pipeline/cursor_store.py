"""Per-source cursor persistence (Phase 1).

A cursor is the channel's "where we left off" — an etag / last-modified for RSS,
a since_id for an id-based API, a since_ts for a time-based one, a page_token for
pagination. The runner loads it before fetching and saves what the channel
returns, so collection resumes incrementally instead of re-fetching everything
and survives crashes mid-pagination.

This module is the seam: a ``CursorStore`` Protocol, an in-memory adapter for
tests and single-process use, and ``DBCursorStore`` backed by the
``source_cursors`` table. The runner depends only on the Protocol, so swapping
adapters changes nothing above.
"""

from typing import Any, Protocol


class CursorStore(Protocol):
    """Load/save a per-source cursor. The runner depends on this Protocol, never a
    concrete store (accept dependencies, don't create them)."""

    async def load(self, source_id: str) -> dict[str, Any] | None: ...

    async def save(self, source_id: str, cursor: dict[str, Any]) -> None: ...


class InMemoryCursorStore:
    """Process-local CursorStore. Used by tests and the not-yet-wired runner; the
    DB adapter replaces it for real incremental collection."""

    def __init__(self) -> None:
        self._cursors: dict[str, dict[str, Any]] = {}

    async def load(self, source_id: str) -> dict[str, Any] | None:
        return self._cursors.get(source_id)

    async def save(self, source_id: str, cursor: dict[str, Any]) -> None:
        self._cursors[source_id] = dict(cursor)


class DBCursorStore:
    """CursorStore backed by the ``source_cursors`` table.

    Owns a short-lived session per call (mirrors the sinks), so it satisfies the
    runner's ``CursorStore`` Protocol without threading a session through. One row
    per source, upserted on save.
    """

    async def load(self, source_id: str) -> dict[str, Any] | None:
        from sqlalchemy import select

        from backend.database import AsyncSessionLocal
        from backend.models.source_cursor import SourceCursor

        async with AsyncSessionLocal() as session:
            row = (
                await session.execute(
                    select(SourceCursor).where(SourceCursor.source_id == source_id)
                )
            ).scalar_one_or_none()
            return dict(row.cursor) if row and row.cursor else None

    async def save(self, source_id: str, cursor: dict[str, Any]) -> None:
        """Upsert the cursor row, serialized per-source so two concurrent runs of
        the same source cannot lose an update.

        Plain SELECT-then-INSERT/UPDATE (the prior implementation) has a race: two
        concurrent ``save()`` calls for the same ``source_id`` can both SELECT
        before either commits, so whichever COMMITs last silently overwrites the
        other's cursor — a lost update that manifests as skipped data on the next
        incremental fetch (the loser's cursor value is gone as if it never
        advanced). Locking the existing row with ``SELECT ... FOR UPDATE`` inside
        this transaction closes that window: the second concurrent caller blocks
        on the lock until the first commits, then reads the first's committed
        value before applying its own write — no schema change needed (the row
        already exists once the first save lands).

        The remaining race is the very first save for a source (no row yet): two
        concurrent callers can both miss the row under ``FOR UPDATE`` (nothing to
        lock) and both attempt an INSERT. ``source_cursors`` already has
        ``UniqueConstraint(source_id)``, so the loser's INSERT raises
        ``IntegrityError``; that is caught and retried (bounded) as a locked
        UPDATE against the row the winner just created, rather than losing the
        retry's cursor value. The retry loop (not just a single re-SELECT) also
        covers same-connection dirty-read artifacts some SQLite pooling setups
        can exhibit, where the row briefly appears absent to the loser even
        after its own INSERT already conflicted.
        """
        from sqlalchemy import select
        from sqlalchemy.exc import IntegrityError

        from backend.database import AsyncSessionLocal
        from backend.models.source_cursor import SourceCursor

        attempts = 3
        for attempt in range(attempts):
            async with AsyncSessionLocal() as session:
                row = (
                    await session.execute(
                        select(SourceCursor)
                        .where(SourceCursor.source_id == source_id)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if row is not None:
                    row.cursor = dict(cursor)
                    await session.commit()
                    return

                try:
                    async with session.begin_nested():
                        session.add(SourceCursor(source_id=source_id, cursor=dict(cursor)))
                    await session.commit()
                    return
                except IntegrityError:
                    # Lost the insert race: another concurrent save() created
                    # the row first (or is in the middle of doing so). Roll
                    # back this attempt's failed insert and retry the whole
                    # select-or-insert sequence in a fresh session/transaction
                    # so this call's cursor value is not silently dropped.
                    await session.rollback()
                    if attempt == attempts - 1:
                        raise
                    continue
