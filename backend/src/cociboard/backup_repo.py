"""Export and replace-all restore of the whole database as a backup document."""

from datetime import UTC, datetime

from sqlalchemy import Engine
from sqlmodel import Session, col, delete, select

from cociboard import __version__
from cociboard.backup import (
    BACKUP_FORMAT,
    SUPPORTED_FORMAT_VERSION,
    BackupDocument,
    BackupMeal,
    BackupRecipe,
    BackupShoppingCheck,
    BackupShoppingExtra,
    RestoreResult,
)
from cociboard.dbfiles import RESTORE_LABEL, backup_sqlite
from cociboard.domain import MealSlot, MealType, Protein, RecipeProperty, SpecialMeal
from cociboard.models import MealAssignment, Recipe, ShoppingCheck, ShoppingExtra


def export_backup(session: Session) -> BackupDocument:
    """Read every table into a backup document. ``ref`` is the recipe id."""
    recipes = session.exec(select(Recipe).order_by(col(Recipe.id))).all()
    meals = session.exec(
        select(MealAssignment).order_by(
            col(MealAssignment.week_start), col(MealAssignment.day), col(MealAssignment.slot)
        )
    ).all()
    checks = session.exec(
        select(ShoppingCheck).order_by(col(ShoppingCheck.week_start), col(ShoppingCheck.item_key))
    ).all()
    extras = session.exec(select(ShoppingExtra).order_by(col(ShoppingExtra.id))).all()
    return BackupDocument(
        format=BACKUP_FORMAT,
        format_version=SUPPORTED_FORMAT_VERSION,
        app_version=__version__,
        exported_at=datetime.now(UTC),
        recipes=[
            BackupRecipe(
                ref=r.id or 0,
                name=r.name,
                description=r.description,
                meal_type=MealType(r.meal_type),
                protein=Protein(r.protein),
                prep_minutes=r.prep_minutes,
                ingredients=list(r.ingredients),
                properties=[RecipeProperty(p) for p in r.properties],
                archived=r.archived_at is not None,
                created_at=r.created_at,
            )
            for r in recipes
        ],
        meals=[
            BackupMeal(
                week_start=m.week_start,
                day=m.day,
                slot=MealSlot(m.slot),
                recipe_ref=m.recipe_id,
                special=None if m.special is None else SpecialMeal(m.special),
                note=m.note,
            )
            for m in meals
        ],
        shopping_checks=[
            BackupShoppingCheck(week_start=c.week_start, item_key=c.item_key) for c in checks
        ],
        shopping_extras=[
            BackupShoppingExtra(
                week_start=e.week_start, name=e.name, checked=e.checked, created_at=e.created_at
            )
            for e in extras
        ],
    )


def _engine_of(session: Session) -> Engine:
    bind = session.get_bind()
    return bind if isinstance(bind, Engine) else bind.engine


def restore_backup(session: Session, doc: BackupDocument) -> RestoreResult:
    """Replace all data with ``doc`` in one transaction.

    ``doc`` must already be validated (``backup.parse_backup``). A file-based SQLite
    database is copied first (``pre-restore``). Any failure rolls back, leaving the data as
    it was. Recipe ids are new; meals are re-linked through ``ref``.
    """
    backup_sqlite(_engine_of(session), RESTORE_LABEL)
    try:
        for table in (MealAssignment, ShoppingCheck, ShoppingExtra, Recipe):
            session.exec(delete(table))
        new_ids: dict[int, int] = {}
        for item in doc.recipes:
            recipe = Recipe(
                name=item.name,
                description=item.description,
                meal_type=item.meal_type,
                protein=item.protein,
                prep_minutes=item.prep_minutes,
                ingredients=list(item.ingredients),
                properties=[p.value for p in item.properties],
                created_at=item.created_at,
                # The archive moment is not part of the format; "now" keeps it set.
                archived_at=datetime.now(UTC) if item.archived else None,
            )
            session.add(recipe)
            session.flush()
            assert recipe.id is not None
            new_ids[item.ref] = recipe.id
        for meal in doc.meals:
            session.add(
                MealAssignment(
                    week_start=meal.week_start,
                    day=meal.day,
                    slot=meal.slot,
                    recipe_id=None if meal.recipe_ref is None else new_ids[meal.recipe_ref],
                    special=None if meal.special is None else meal.special.value,
                    note=meal.note,
                )
            )
        for check in doc.shopping_checks:
            session.add(ShoppingCheck(week_start=check.week_start, item_key=check.item_key))
        for extra in doc.shopping_extras:
            session.add(
                ShoppingExtra(
                    week_start=extra.week_start,
                    name=extra.name,
                    checked=extra.checked,
                    created_at=extra.created_at,
                )
            )
        session.commit()
    except BaseException:
        session.rollback()
        raise
    return RestoreResult(
        recipes=len(doc.recipes),
        meals=len(doc.meals),
        shopping_checks=len(doc.shopping_checks),
        shopping_extras=len(doc.shopping_extras),
    )
