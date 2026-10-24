"""Persistence and rules for weekly plans (``MealAssignment`` rows)."""

import random
from datetime import date

from sqlmodel import Session, col, delete, select

from cociboard import repository
from cociboard.domain import MealSlot, date_of, fits_slot, is_valid_day_index, is_week_start
from cociboard.models import MealAssignment, Recipe
from cociboard.schemas import (
    CandidateRead,
    DayPlanRead,
    RecipeRead,
    SlotFill,
    VarietyReport,
    WeekPlanRead,
)
from cociboard.suggest import candidates_for_slot, suggest_fills
from cociboard.variety import MealInfo, analyze_week, slot_index, slot_position


class InvalidWeekError(Exception):
    """The week key is not a Monday."""


class InvalidDayError(Exception):
    """The day index is outside 0-6."""


class IncompatibleSlotError(Exception):
    """A recipe's meal type does not fit the target slot."""


class EmptySlotError(Exception):
    """The source slot of a move holds no recipe."""


def _check_position(week_start: date, day: int) -> None:
    if not is_week_start(week_start):
        raise InvalidWeekError(week_start)
    if not is_valid_day_index(day):
        raise InvalidDayError(day)


def _find(session: Session, week_start: date, day: int, slot: MealSlot) -> MealAssignment | None:
    statement = select(MealAssignment).where(
        MealAssignment.week_start == week_start,
        MealAssignment.day == day,
        MealAssignment.slot == slot,
    )
    return session.exec(statement).first()


def meal_info(recipe: Recipe | RecipeRead) -> MealInfo:
    """The slice of a recipe that variety analysis and suggestions work with."""
    assert recipe.id is not None
    return MealInfo(
        recipe_id=recipe.id,
        name=recipe.name,
        protein=recipe.protein,
        properties=frozenset(recipe.properties),
        meal_type=recipe.meal_type,
    )


def _load_recipes(session: Session, week_start: date) -> dict[tuple[int, MealSlot], Recipe]:
    rows = session.exec(
        select(MealAssignment).where(col(MealAssignment.week_start) == week_start)
    ).all()
    return {(row.day, row.slot): repository.get_recipe(session, row.recipe_id) for row in rows}


def _meals(by_slot: dict[tuple[int, MealSlot], Recipe]) -> list[MealInfo | None]:
    meals: list[MealInfo | None] = [None] * 14
    for (day, slot), recipe in by_slot.items():
        meals[slot_index(day, slot)] = meal_info(recipe)
    return meals


def get_variety(session: Session, week_start: date) -> VarietyReport:
    """Variety analysis of the stored plan of a week."""
    _check_position(week_start, 0)
    return analyze_week(_meals(_load_recipes(session, week_start)))


def get_week_plan(session: Session, week_start: date) -> WeekPlanRead:
    """Return the plan for the week starting on Monday ``week_start``, with its variety."""
    _check_position(week_start, 0)
    recipes = _load_recipes(session, week_start)
    by_slot = {key: RecipeRead.model_validate(recipe) for key, recipe in recipes.items()}
    days = [
        DayPlanRead(
            day=day,
            date=date_of(week_start, day),
            lunch=by_slot.get((day, MealSlot.lunch)),
            dinner=by_slot.get((day, MealSlot.dinner)),
        )
        for day in range(7)
    ]
    return WeekPlanRead(week_start=week_start, days=days, variety=analyze_week(_meals(recipes)))


def assign_slot(
    session: Session, week_start: date, day: int, slot: MealSlot, recipe_id: int
) -> WeekPlanRead:
    """Place a recipe in a slot, replacing any current one.

    Raises :class:`repository.RecipeNotFoundError` or :class:`IncompatibleSlotError`.
    """
    _check_position(week_start, day)
    recipe = repository.get_recipe(session, recipe_id)
    if not fits_slot(recipe.meal_type, slot):
        raise IncompatibleSlotError(recipe_id)
    existing = _find(session, week_start, day, slot)
    if existing is None:
        session.add(MealAssignment(week_start=week_start, day=day, slot=slot, recipe_id=recipe_id))
    else:
        existing.recipe_id = recipe_id
        session.add(existing)
    session.commit()
    return get_week_plan(session, week_start)


def clear_slot(session: Session, week_start: date, day: int, slot: MealSlot) -> WeekPlanRead:
    """Empty a slot. Clearing an empty slot is a no-op."""
    _check_position(week_start, day)
    existing = _find(session, week_start, day, slot)
    if existing is not None:
        session.delete(existing)
        session.commit()
    return get_week_plan(session, week_start)


def move_slot(
    session: Session,
    week_start: date,
    from_day: int,
    from_slot: MealSlot,
    to_day: int,
    to_slot: MealSlot,
) -> WeekPlanRead:
    """Move a recipe to another slot, swapping with the occupant if there is one.

    Both recipes must fit their new slots. Raises :class:`EmptySlotError` when the source
    slot is empty and :class:`IncompatibleSlotError` when either recipe would not fit.
    """
    _check_position(week_start, from_day)
    _check_position(week_start, to_day)
    source = _find(session, week_start, from_day, from_slot)
    if source is None:
        raise EmptySlotError((from_day, from_slot))
    if (from_day, from_slot) == (to_day, to_slot):
        return get_week_plan(session, week_start)
    target = _find(session, week_start, to_day, to_slot)
    moved = repository.get_recipe(session, source.recipe_id)
    if not fits_slot(moved.meal_type, to_slot):
        raise IncompatibleSlotError(moved.id)
    if target is None:
        source.day, source.slot = to_day, to_slot
        session.add(source)
    else:
        displaced = repository.get_recipe(session, target.recipe_id)
        if not fits_slot(displaced.meal_type, from_slot):
            raise IncompatibleSlotError(displaced.id)
        source.recipe_id, target.recipe_id = target.recipe_id, source.recipe_id
        session.add(source)
        session.add(target)
    session.commit()
    return get_week_plan(session, week_start)


def clear_week(session: Session, week_start: date) -> WeekPlanRead:
    """Remove every assignment of a week."""
    _check_position(week_start, 0)
    session.exec(delete(MealAssignment).where(col(MealAssignment.week_start) == week_start))
    session.commit()
    return get_week_plan(session, week_start)


def replace_week(session: Session, week_start: date, slots: list[SlotFill]) -> WeekPlanRead:
    """Replace the whole plan of a week atomically (used by undo).

    Every recipe must exist and fit its slot, otherwise nothing is changed. If a slot is
    listed twice the last entry wins.
    """
    _check_position(week_start, 0)
    chosen: dict[tuple[int, MealSlot], int] = {}
    for fill in slots:
        recipe = repository.get_recipe(session, fill.recipe_id)
        if not fits_slot(recipe.meal_type, fill.slot):
            raise IncompatibleSlotError(fill.recipe_id)
        chosen[(fill.day, fill.slot)] = fill.recipe_id
    session.exec(delete(MealAssignment).where(col(MealAssignment.week_start) == week_start))
    for (day, slot), recipe_id in chosen.items():
        session.add(MealAssignment(week_start=week_start, day=day, slot=slot, recipe_id=recipe_id))
    session.commit()
    return get_week_plan(session, week_start)


def suggest_week(session: Session, week_start: date, seed: int | None = None) -> WeekPlanRead:
    """Fill the empty slots of a week with varied recipes; filled slots are untouched.

    The same ``seed`` on the same plan and catalogue gives the same result.
    """
    _check_position(week_start, 0)
    meals = _meals(_load_recipes(session, week_start))
    catalogue = [meal_info(recipe) for recipe in repository.list_recipes(session)]
    rng = random.Random(seed)
    for index, meal in suggest_fills(meals, catalogue, rng).items():
        position = slot_position(index)
        session.add(
            MealAssignment(
                week_start=week_start,
                day=position.day,
                slot=position.slot,
                recipe_id=meal.recipe_id,
            )
        )
    session.commit()
    return get_week_plan(session, week_start)


def slot_candidates(
    session: Session, week_start: date, day: int, slot: MealSlot
) -> list[CandidateRead]:
    """Recipes compatible with a slot, ordered by the variety score they would give."""
    _check_position(week_start, day)
    meals = _meals(_load_recipes(session, week_start))
    recipes = {r.id: r for r in repository.list_recipes(session)}
    catalogue = [meal_info(recipe) for recipe in recipes.values()]
    return [
        CandidateRead(
            recipe=RecipeRead.model_validate(recipes[candidate.meal.recipe_id]),
            score_delta=candidate.score_delta,
            reason=candidate.reason,
            good_pick=candidate.good_pick,
        )
        for candidate in candidates_for_slot(meals, slot_index(day, slot), catalogue)
    ]
