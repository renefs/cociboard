"""Startup integrity check: ``quick_check`` and orphaned planned meals.

Before foreign keys were enforced (ADR-0022) a meal could point at a recipe that no longer
exists. Such rows are backed up and removed; anything else unexpected is only reported.
"""

import logging
from dataclasses import dataclass

from sqlalchemy import BindParameter, Engine, bindparam, text

from cociboard.dbfiles import backup_sqlite, sqlite_file
from cociboard.models import MealAssignment, Recipe

logger = logging.getLogger("cociboard.integrity")

INTEGRITY_LABEL = "integrity"
ASSIGNMENT_TABLE = MealAssignment.__tablename__
RECIPE_TABLE = Recipe.__tablename__


@dataclass(frozen=True)
class FkViolation:
    """One row of ``PRAGMA foreign_key_check``."""

    table: str
    rowid: int | None
    parent: str
    fk_index: int


@dataclass(frozen=True)
class IntegrityPlan:
    """What to do about foreign key violations."""

    orphan_rowids: tuple[int, ...]  # meals whose recipe is gone: safe to delete
    unexpected: tuple[FkViolation, ...]  # anything else: report only


def quick_check_ok(rows: list[str]) -> bool:
    """``PRAGMA quick_check`` answers a single ``ok`` row when the file is sound."""
    return rows == ["ok"]


def plan_integrity_fix(violations: list[FkViolation]) -> IntegrityPlan:
    """Split violations into orphaned meal rows (deletable) and everything else."""
    orphans: list[int] = []
    unexpected: list[FkViolation] = []
    for v in violations:
        if v.table == ASSIGNMENT_TABLE and v.parent == RECIPE_TABLE and v.rowid is not None:
            orphans.append(v.rowid)
        else:
            unexpected.append(v)
    return IntegrityPlan(tuple(sorted(set(orphans))), tuple(unexpected))


def _delete_orphans(engine: Engine, rowids: tuple[int, ...]) -> None:
    ids: BindParameter[list[int]] = bindparam("ids", expanding=True)
    with engine.begin() as connection:
        weeks = connection.execute(
            text(
                f"SELECT DISTINCT week_start FROM {ASSIGNMENT_TABLE} "
                "WHERE rowid IN :ids ORDER BY week_start"
            ).bindparams(ids),
            {"ids": list(rowids)},
        ).scalars()
        week_list = [str(w) for w in weeks]
        connection.execute(
            text(f"DELETE FROM {ASSIGNMENT_TABLE} WHERE rowid IN :ids").bindparams(ids),
            {"ids": list(rowids)},
        )
    logger.warning(
        "Removed %d planned meal(s) that pointed at a missing recipe (weeks: %s)",
        len(rowids),
        ", ".join(week_list),
    )


def run_integrity_check(engine: Engine) -> None:
    """Check the database and clean orphaned meals. Never raises: startup must go on."""
    if engine.url.get_backend_name() != "sqlite":
        return
    try:
        with engine.connect() as connection:
            quick = [str(r[0]) for r in connection.exec_driver_sql("PRAGMA quick_check")]
            violations = [
                FkViolation(str(r[0]), r[1], str(r[2]), int(r[3]))
                for r in connection.exec_driver_sql("PRAGMA foreign_key_check")
            ]
            connection.rollback()
        if quick_check_ok(quick):
            logger.info("Integrity check: quick_check ok")
        else:
            logger.error("Integrity check: quick_check reported: %s", "; ".join(quick))
        plan = plan_integrity_fix(violations)
        for v in plan.unexpected:
            logger.error(
                "Integrity check: unexpected foreign key violation in %s (rowid %s, parent %s)",
                v.table,
                v.rowid,
                v.parent,
            )
        if plan.orphan_rowids:
            if sqlite_file(engine) is not None:
                backup_sqlite(engine, INTEGRITY_LABEL)
            _delete_orphans(engine, plan.orphan_rowids)
    except Exception:
        logger.exception("Integrity check failed; continuing without it")
