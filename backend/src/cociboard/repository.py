"""Persistence operations for recipes."""

from collections.abc import Sequence
from datetime import UTC, date, datetime

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, delete, select

from cociboard.domain import MealSlot, MealType, RecipeProperty, fits_slot, fold_text
from cociboard.history import RecipeHistory, planned_meals, summarize_by_recipe, summarize_dates
from cociboard.models import MealAssignment, Recipe
from cociboard.schemas import (
    PlannedMealRead,
    RecipeCreate,
    RecipeHistoryRead,
    RecipeRead,
    RecipeUpdate,
)


class RecipeNotFoundError(Exception):
    """Raised when a recipe id does not exist."""


class DuplicateRecipeNameError(Exception):
    """Raised when a recipe name is already taken; ``archived`` tells if by an archived one."""

    def __init__(self, name: str, archived: bool = False) -> None:
        super().__init__(name)
        self.archived = archived


class MealTypeConflictError(Exception):
    """Raised when a new meal type no longer fits slots the recipe occupies."""

    def __init__(self, conflicts: list[MealAssignment]) -> None:
        super().__init__(f"{len(conflicts)} planned meals no longer fit")
        self.conflicts = conflicts


def _name_clash(session: Session, name: str, exclude_id: int | None = None) -> Recipe | None:
    """The recipe (archived or not) already holding ``name``, if any."""
    statement = select(Recipe).where(func.lower(col(Recipe.name)) == name.lower())
    return next((r for r in session.exec(statement) if r.id != exclude_id), None)


def name_taken(session: Session, name: str) -> bool:
    """Whether an active or archived recipe already has ``name`` (case-insensitive)."""
    return _name_clash(session, name) is not None


def _raise_if_taken(session: Session, name: str, exclude_id: int | None = None) -> None:
    clash = _name_clash(session, name, exclude_id)
    if clash is not None:
        raise DuplicateRecipeNameError(name, archived=clash.archived_at is not None)


def matches(
    recipe: Recipe,
    slot: MealSlot | None,
    query: str | None,
    properties: Sequence[RecipeProperty],
    favourite: bool = False,
) -> bool:
    """Whether ``recipe`` satisfies all given filters (properties are AND-ed)."""
    if favourite and not recipe.favourite:
        return False
    if slot is not None and not fits_slot(recipe.meal_type, slot):
        return False
    if properties and not {p.value for p in properties} <= set(recipe.properties):
        return False
    if query:
        needle = fold_text(query.strip())
        haystack = [recipe.name, *recipe.ingredients]
        if needle and not any(needle in fold_text(text) for text in haystack):
            return False
    return True


def list_recipes(
    session: Session,
    slot: MealSlot | None = None,
    query: str | None = None,
    properties: Sequence[RecipeProperty] = (),
    archived: bool = False,
    favourite: bool = False,
) -> list[Recipe]:
    """Return recipes ordered by name, filtered by slot, text, properties and favourite.

    Archived recipes are left out unless ``archived`` is true, which returns only them.
    """
    recipes = session.exec(select(Recipe).order_by(func.lower(col(Recipe.name)))).all()
    return [
        r
        for r in recipes
        if (r.archived_at is not None) == archived
        and matches(r, slot, query, properties, favourite)
    ]


def get_recipe(session: Session, recipe_id: int) -> Recipe:
    """Return one recipe or raise :class:`RecipeNotFoundError`."""
    recipe = session.get(Recipe, recipe_id)
    if recipe is None:
        raise RecipeNotFoundError(recipe_id)
    return recipe


def _commit(session: Session, recipe: Recipe) -> Recipe:
    try:
        session.add(recipe)
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise DuplicateRecipeNameError(recipe.name) from exc
    session.refresh(recipe)
    return recipe


def create_recipe(session: Session, data: RecipeCreate) -> Recipe:
    """Insert a recipe; raise :class:`DuplicateRecipeNameError` on a name clash."""
    _raise_if_taken(session, data.name)
    recipe = Recipe(
        name=data.name,
        description=data.description,
        meal_type=data.meal_type,
        protein=data.protein,
        prep_minutes=data.prep_minutes,
        ingredients=list(data.ingredients),
        properties=[p.value for p in data.properties],
        servings=data.servings,
        steps=list(data.steps),
        source_url=data.source_url,
        favourite=data.favourite,
    )
    return _commit(session, recipe)


def incompatible_assignments(
    session: Session, recipe_id: int, meal_type: MealType
) -> list[MealAssignment]:
    """Return the planned slots of a recipe that would not fit ``meal_type``."""
    statement = (
        select(MealAssignment)
        .where(col(MealAssignment.recipe_id) == recipe_id)
        .order_by(col(MealAssignment.week_start), col(MealAssignment.day), col(MealAssignment.slot))
    )
    return [a for a in session.exec(statement) if not fits_slot(meal_type, a.slot)]


def count_usage(session: Session, recipe_id: int) -> int:
    """Return in how many planned slots (all weeks) a recipe is used."""
    get_recipe(session, recipe_id)
    statement = (
        select(func.count())
        .select_from(MealAssignment)
        .where(col(MealAssignment.recipe_id) == recipe_id)
    )
    return session.exec(statement).one()


def update_recipe(
    session: Session, recipe_id: int, data: RecipeUpdate, force: bool = False
) -> Recipe:
    """Apply a partial update to a recipe.

    A meal-type change that no longer fits planned slots raises
    :class:`MealTypeConflictError`; with ``force`` those assignments are removed instead.
    """
    recipe = get_recipe(session, recipe_id)
    changes = data.changes()
    new_name = changes.get("name")
    if isinstance(new_name, str):
        _raise_if_taken(session, new_name, exclude_id=recipe_id)
    if data.meal_type is not None and data.meal_type != recipe.meal_type:
        conflicts = incompatible_assignments(session, recipe_id, data.meal_type)
        if conflicts and not force:
            raise MealTypeConflictError(conflicts)
        for assignment in conflicts:
            session.delete(assignment)
    if "properties" in changes:
        changes["properties"] = [p.value for p in data.properties or []]
    if "archived" in changes:
        # Archiving only flips the flag: planned meals are never touched.
        archived = bool(changes.pop("archived"))
        if archived != (recipe.archived_at is not None):
            recipe.archived_at = datetime.now(UTC) if archived else None
    for key, value in changes.items():
        setattr(recipe, key, value)
    return _commit(session, recipe)


def delete_recipe(session: Session, recipe_id: int) -> None:
    """Delete a recipe and every planned meal using it (all weeks).

    Raises :class:`RecipeNotFoundError`. Archiving is the non-destructive alternative.
    """
    recipe = get_recipe(session, recipe_id)
    session.exec(delete(MealAssignment).where(col(MealAssignment.recipe_id) == recipe_id))
    session.delete(recipe)
    session.commit()


def count_recipes(session: Session) -> int:
    """Return the number of stored recipes."""
    return session.exec(select(func.count()).select_from(Recipe)).one()


def _history_by_recipe(session: Session, today: date) -> dict[int, RecipeHistory]:
    """History of every planned recipe, from one query over the meal assignments."""
    statement = select(
        col(MealAssignment.recipe_id), col(MealAssignment.week_start), col(MealAssignment.day)
    ).where(col(MealAssignment.recipe_id).is_not(None))
    rows = [(r, w, d) for r, w, d in session.exec(statement) if r is not None]
    return summarize_by_recipe(rows, today)


def to_reads(session: Session, recipes: Sequence[Recipe], today: date) -> list[RecipeRead]:
    """Recipes as API objects with their history relative to ``today``."""
    history = _history_by_recipe(session, today)
    reads = []
    for recipe in recipes:
        stats = history.get(recipe.id or 0, RecipeHistory())
        reads.append(
            RecipeRead.model_validate(recipe).model_copy(
                update={
                    "last_planned_on": stats.last_planned_on,
                    "next_planned_on": stats.next_planned_on,
                    "times_planned": stats.times_planned,
                }
            )
        )
    return reads


def recipe_history(session: Session, recipe_id: int, today: date, limit: int) -> RecipeHistoryRead:
    """Totals and the ``limit`` most recent planned meals of a recipe (past and upcoming)."""
    get_recipe(session, recipe_id)
    statement = select(
        col(MealAssignment.week_start), col(MealAssignment.day), col(MealAssignment.slot)
    ).where(col(MealAssignment.recipe_id) == recipe_id)
    meals = planned_meals(list(session.exec(statement)))
    stats = summarize_dates([m.date for m in meals], today)
    return RecipeHistoryRead(
        times_planned=stats.times_planned,
        last_planned_on=stats.last_planned_on,
        next_planned_on=stats.next_planned_on,
        meals=[
            PlannedMealRead(
                date=m.date,
                week_start=m.week_start,
                day=m.day,
                slot=m.slot,
                upcoming=m.date > today,
            )
            for m in meals[:limit]
        ],
    )
