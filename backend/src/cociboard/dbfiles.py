"""SQLite file helpers shared by migrations, restores and automatic backups.

Copies are named ``<db>.bak-<label>-<UTC stamp>``. The label decides the *kind* of copy and
each kind rotates on its own, so a new copy of one kind can never push out another kind.
"""

import logging
import sqlite3
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

from sqlalchemy import Engine
from sqlmodel import Session

logger = logging.getLogger("cociboard.backup")

# Safety copies made before a restore rotate separately from migration copies, so a
# restore can never push out the copy taken before a schema upgrade (or the reverse).
RESTORE_LABEL = "pre-restore"
AUTO_LABEL = "auto"


class BackupKind(StrEnum):
    """What a copy is for; every kind keeps its own number of copies."""

    migration = "migration"  # labelled with the old revision, ``legacy`` or ``integrity``
    pre_restore = "pre_restore"
    auto = "auto"


# Copies kept per kind. Automatic copies are configurable (``backups_kept``).
DEFAULT_KEPT: dict[BackupKind, int] = {
    BackupKind.migration: 3,
    BackupKind.pre_restore: 3,
    BackupKind.auto: 7,
}


def sqlite_file(engine: Engine) -> Path | None:
    """Path of the SQLite database file, or None for other or in-memory databases."""
    url = engine.url
    if url.get_backend_name() != "sqlite" or url.database in (None, "", ":memory:"):
        return None
    if url.database.startswith("file:"):
        return None
    return Path(url.database)


def engine_of(session: Session) -> Engine:
    """The engine behind a session (its bind may be a connection)."""
    bind = session.get_bind()
    return bind if isinstance(bind, Engine) else bind.engine


def kind_of_label(label: str) -> BackupKind:
    """Kind for a new copy: every label except ``pre-restore`` and ``auto`` is a migration copy."""
    if label == RESTORE_LABEL:
        return BackupKind.pre_restore
    if label == AUTO_LABEL:
        return BackupKind.auto
    return BackupKind.migration


def kind_of_copy(path: Path, db_name: str) -> BackupKind | None:
    """Kind of an existing copy file, or None when it is not a copy of ``db_name``."""
    prefix = f"{db_name}.bak-"
    if not path.name.startswith(prefix):
        return None
    rest = path.name[len(prefix) :]
    label, sep, _stamp = rest.rpartition("-")
    return kind_of_label(label if sep else rest)


def list_copies(db_path: Path, directory: Path, kind: BackupKind) -> list[Path]:
    """Copies of one kind in ``directory``, oldest first (mtime, then name)."""
    if not directory.is_dir():
        return []
    found = (
        p for p in directory.glob(f"{db_path.name}.bak-*") if kind_of_copy(p, db_path.name) == kind
    )
    return sorted(found, key=lambda p: (p.stat().st_mtime_ns, p.name))


def backup_sqlite(
    engine: Engine,
    label: str,
    *,
    directory: Path | None = None,
    keep: int | None = None,
) -> Path | None:
    """Copy a file-based SQLite database and prune old copies of the same kind.

    Uses the SQLite online backup API, so it is safe while the app is writing. The copy goes
    next to the database unless ``directory`` is given (created when missing). Returns the new
    file, or None when the database is not a file. ``keep`` overrides how many copies of this
    kind are kept (default: :data:`DEFAULT_KEPT`); other kinds are never touched.
    """
    path = sqlite_file(engine)
    if path is None:
        return None
    kind = kind_of_label(label)
    target_dir = directory if directory is not None else path.parent
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = target_dir / f"{path.name}.bak-{label}-{stamp}"
    try:
        source = sqlite3.connect(path)
        try:
            dest = sqlite3.connect(target)
            try:
                source.backup(dest)
            finally:
                dest.close()
        finally:
            source.close()
    except BaseException:
        # A half-written file must not count as a copy (or push a good one out).
        target.unlink(missing_ok=True)
        raise
    logger.info("Backed up database to %s", target)
    limit = max(1, keep if keep is not None else DEFAULT_KEPT[kind])
    for old in list_copies(path, target_dir, kind)[:-limit]:
        old.unlink()
        logger.info("Removed old backup %s", old)
    return target
