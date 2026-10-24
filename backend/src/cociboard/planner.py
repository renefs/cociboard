"""Persistence and rules for weekly plans (``MealAssignment`` rows)."""

from datetime import date

from sqlmodel import Session, col, select

from cociboard import repository
from cociboard.domain import MealSlot, date_of, fits_slot, is_valid_day_index, is_week_start
from cociboard.models import MealAssignment
from cociboard.schemas import DayPlanRead, RecipeRead, WeekPlanRead


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


def get_week_plan(session: Session, week_start: date) -> WeekPlanRead:
    """Return the plan for the week starting on Monday ``week_start``."""
    _check_position(week_start, 0)
    rows = session.exec(
        select(MealAssignment).where(col(MealAssignment.week_start) == week_start)
    ).all()
    by_slot: dict[tuple[int, MealSlot], RecipeRead] = {}
    for row in rows:
        recipe = repository.get_recipe(session, row.recipe_id)
        by_slot[(row.day, row.slot)] = RecipeRead.model_validate(recipe)
    days = [
        DayPlanRead(
            day=day,
            date=date_of(week_start, day),
            lunch=by_slot.get((day, MealSlot.lunch)),
            dinner=by_slot.get((day, MealSlot.dinner)),
        )
        for day in range(7)
    ]
    return WeekPlanRead(week_start=week_start, days=days)


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
