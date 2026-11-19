"""SQLite file helpers shared by migrations and restores: locate the file, copy it, rotate."""

import logging
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import Engine

logger = logging.getLogger("cociboard.backup")

BACKUPS_KEPT = 3
# Safety copies made before a restore rotate separately from migration copies, so a
# restore can never push out the copy taken before a schema upgrade (or the reverse).
RESTORE_LABEL = "pre-restore"


def sqlite_file(engine: Engine) -> Path | None:
    """Path of the SQLite database file, or None for other or in-memory databases."""
    url = engine.url
    if url.get_backend_name() != "sqlite" or url.database in (None, "", ":memory:"):
        return None
    if url.database.startswith("file:"):
        return None
    return Path(url.database)


def _is_restore_copy(path: Path, db_name: str) -> bool:
    return path.name.startswith(f"{db_name}.bak-{RESTORE_LABEL}-")


def backup_sqlite(engine: Engine, label: str) -> Path | None:
    """Copy a file-based SQLite database next to itself and prune old copies.

    Uses the SQLite online backup API. Returns the new file, or None when the database
    is not a file. At most :data:`BACKUPS_KEPT` copies are kept per kind: ``pre-restore``
    copies and all others (migration copies) are counted separately.
    """
    path = sqlite_file(engine)
    if path is None:
        return None
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = path.with_name(f"{path.name}.bak-{label}-{stamp}")
    source = sqlite3.connect(path)
    try:
        dest = sqlite3.connect(target)
        try:
            source.backup(dest)
        finally:
            dest.close()
    finally:
        source.close()
    logger.info("Backed up database to %s", target)
    same_kind = _is_restore_copy(target, path.name)
    # Timestamps sort lexicographically; the label can differ, so sort by mtime then name.
    backups = sorted(
        (
            p
            for p in path.parent.glob(f"{path.name}.bak-*")
            if _is_restore_copy(p, path.name) == same_kind
        ),
        key=lambda p: (p.stat().st_mtime_ns, p.name),
    )
    for old in backups[:-BACKUPS_KEPT]:
        old.unlink()
        logger.info("Removed old backup %s", old)
    return target
