"""Persistence and rules for weekly plans (``MealAssignment`` rows)."""

import random
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, delete, select

from cociboard import household_repo, repository
from cociboard.domain import (
    MealSlot,
    SpecialMeal,
    date_of,
    fits_slot,
    is_valid_day_index,
    is_week_start,
)
from cociboard.models import MealAssignment, Recipe
from cociboard.schemas import (
    CandidateRead,
    DayPlanRead,
    RecipeRead,
    SlotFill,
    VarietyReport,
    WeekCopyRead,
    WeekPlanRead,
)
from cociboard.suggest import candidates_for_slot, suggest_fills
from cociboard.variety import (
    MealInfo,
    WeekContext,
    analyze_week,
    slot_index,
    slot_position,
)


class InvalidWeekError(Exception):
    """The week key is not a Monday."""


class InvalidDayError(Exception):
    """The day index is outside 0-6."""


class IncompatibleSlotError(Exception):
    """A recipe's meal type does not fit the target slot."""


class RecipeArchivedError(Exception):
    """An archived recipe cannot be newly assigned to a slot."""


class InvalidMealError(Exception):
    """A slot entry must hold exactly one of a recipe and a special meal."""


class EmptySlotError(Exception):
    """The slot of a move or a note change holds nothing."""


class InvalidCopySourceError(Exception):
    """The source week of a copy is not a Monday or is the target week itself."""


class PlanConflictError(Exception):
    """A concurrent write broke the one-recipe-per-slot constraint; the change was rolled back."""


def _commit(session: Session) -> None:
    """Commit, turning a unique-constraint violation into :class:`PlanConflictError`."""
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise PlanConflictError from None


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


@dataclass(frozen=True)
class PlannedSlot:
    """What one filled slot holds: a recipe or a special meal, and an optional note."""

    recipe: Recipe | None
    special: SpecialMeal | None
    note: str | None


def _load_slots(session: Session, week_start: date) -> dict[tuple[int, MealSlot], PlannedSlot]:
    rows = session.exec(
        select(MealAssignment).where(col(MealAssignment.week_start) == week_start)
    ).all()
    return {
        (row.day, row.slot): PlannedSlot(
            recipe=None if row.recipe_id is None else repository.get_recipe(session, row.recipe_id),
            special=None if row.special is None else SpecialMeal(row.special),
            note=row.note,
        )
        for row in rows
    }


def _meals(by_slot: dict[tuple[int, MealSlot], PlannedSlot]) -> list[MealInfo | None]:
    """The 14-meal list for variety: special slots are ``None`` (no meal) like empty ones."""
    meals: list[MealInfo | None] = [None] * 14
    for (day, slot), planned in by_slot.items():
        if planned.recipe is not None:
            meals[slot_index(day, slot)] = meal_info(planned.recipe)
    return meals


def _occupied(by_slot: dict[tuple[int, MealSlot], PlannedSlot]) -> frozenset[int]:
    """Indices of every filled slot, special ones included (never filled by Suggest)."""
    return frozenset(slot_index(day, slot) for day, slot in by_slot)


def week_context(session: Session, week_start: date) -> WeekContext:
    """What the two previous weeks contribute to the variety of ``week_start``.

    Archived recipes count: they were really eaten.
    """
    previous = week_start - timedelta(days=7)
    before = week_start - timedelta(days=14)
    last = _meals(_load_slots(session, previous))
    older = _meals(_load_slots(session, before))
    recent = {meal.recipe_id: 2 for meal in older if meal is not None}
    recent.update({meal.recipe_id: 1 for meal in last if meal is not None})  # nearest wins
    return WeekContext(previous_dinner=last[slot_index(6, MealSlot.dinner)], recent=recent)


def get_variety(session: Session, week_start: date) -> VarietyReport:
    """Variety analysis of the stored plan of a week."""
    _check_position(week_start, 0)
    meals = _meals(_load_slots(session, week_start))
    household = household_repo.get_household(session)
    return analyze_week(meals, week_context(session, week_start), household.targets)


def get_week_plan(session: Session, week_start: date) -> WeekPlanRead:
    """Return the plan for the week starting on Monday ``week_start``, with its variety."""
    _check_position(week_start, 0)
    slots = _load_slots(session, week_start)

    def recipe_of(day: int, slot: MealSlot) -> RecipeRead | None:
        planned = slots.get((day, slot))
        if planned is None or planned.recipe is None:
            return None
        return RecipeRead.model_validate(planned.recipe)

    def special_of(day: int, slot: MealSlot) -> SpecialMeal | None:
        planned = slots.get((day, slot))
        return None if planned is None else planned.special

    def note_of(day: int, slot: MealSlot) -> str | None:
        planned = slots.get((day, slot))
        return None if planned is None else planned.note

    days = [
        DayPlanRead(
            day=day,
            date=date_of(week_start, day),
            lunch=recipe_of(day, MealSlot.lunch),
            dinner=recipe_of(day, MealSlot.dinner),
            lunch_special=special_of(day, MealSlot.lunch),
            dinner_special=special_of(day, MealSlot.dinner),
            lunch_note=note_of(day, MealSlot.lunch),
            dinner_note=note_of(day, MealSlot.dinner),
        )
        for day in range(7)
    ]
    variety = analyze_week(
        _meals(slots),
        week_context(session, week_start),
        household_repo.get_household(session).targets,
    )
    return WeekPlanRead(week_start=week_start, days=days, variety=variety)


def _check_content(recipe_id: int | None, special: SpecialMeal | None) -> None:
    if (recipe_id is None) == (special is None):
        raise InvalidMealError


def assign_slot(
    session: Session,
    week_start: date,
    day: int,
    slot: MealSlot,
    recipe_id: int | None = None,
    special: SpecialMeal | None = None,
    note: str | None = None,
) -> WeekPlanRead:
    """Place a recipe or a special meal in a slot, replacing the current entry.

    The note given is the note stored: replacing an entry without a note clears its note.
    Raises :class:`InvalidMealError`, :class:`repository.RecipeNotFoundError`,
    :class:`RecipeArchivedError` or :class:`IncompatibleSlotError`.
    """
    _check_position(week_start, day)
    _check_content(recipe_id, special)
    if recipe_id is not None:
        recipe = repository.get_recipe(session, recipe_id)
        if recipe.archived_at is not None:
            raise RecipeArchivedError(recipe_id)
        if not fits_slot(recipe.meal_type, slot):
            raise IncompatibleSlotError(recipe_id)
    existing = _find(session, week_start, day, slot)
    if existing is None:
        existing = MealAssignment(week_start=week_start, day=day, slot=slot)
    existing.recipe_id = recipe_id
    existing.special = None if special is None else special.value
    existing.note = note
    session.add(existing)
    _commit(session)
    return get_week_plan(session, week_start)


def set_note(
    session: Session, week_start: date, day: int, slot: MealSlot, note: str | None
) -> WeekPlanRead:
    """Set or clear the note of a filled slot. Raises :class:`EmptySlotError` if it is empty."""
    _check_position(week_start, day)
    existing = _find(session, week_start, day, slot)
    if existing is None:
        raise EmptySlotError((day, slot))
    existing.note = note
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
    """Move a meal to another slot, swapping with the occupant if there is one.

    The whole entry moves (recipe or special meal, with its note). Recipes must fit their
    new slots; special meals fit anywhere. Raises :class:`EmptySlotError` when the source
    slot is empty and :class:`IncompatibleSlotError` when a recipe would not fit.
    """
    _check_position(week_start, from_day)
    _check_position(week_start, to_day)
    source = _find(session, week_start, from_day, from_slot)
    if source is None:
        raise EmptySlotError((from_day, from_slot))
    if (from_day, from_slot) == (to_day, to_slot):
        return get_week_plan(session, week_start)
    target = _find(session, week_start, to_day, to_slot)
    _check_fits(session, source, to_slot)
    if target is None:
        source.day, source.slot = to_day, to_slot
        session.add(source)
    else:
        _check_fits(session, target, from_slot)
        # Swap the contents, not the rows, so the unique constraint is never violated.
        source.recipe_id, target.recipe_id = target.recipe_id, source.recipe_id
        source.special, target.special = target.special, source.special
        source.note, target.note = target.note, source.note
        session.add(source)
        session.add(target)
    _commit(session)
    return get_week_plan(session, week_start)


def _check_fits(session: Session, entry: MealAssignment, slot: MealSlot) -> None:
    if entry.recipe_id is None:
        return
    recipe = repository.get_recipe(session, entry.recipe_id)
    if not fits_slot(recipe.meal_type, slot):
        raise IncompatibleSlotError(recipe.id)


def clear_week(session: Session, week_start: date) -> WeekPlanRead:
    """Remove every assignment of a week."""
    _check_position(week_start, 0)
    session.exec(delete(MealAssignment).where(col(MealAssignment.week_start) == week_start))
    session.commit()
    return get_week_plan(session, week_start)


def replace_week(session: Session, week_start: date, slots: list[SlotFill]) -> WeekPlanRead:
    """Replace the whole plan of a week atomically (used by undo).

    Entries are recipes or special meals, each with its note. Every recipe must exist and
    fit its slot, otherwise nothing is changed. If a slot is listed twice the last entry
    wins. Archived recipes are accepted on purpose: undoing "Clear week" must restore
    meals whose recipe was archived meanwhile (ADR-0014).
    """
    _check_position(week_start, 0)
    chosen: dict[tuple[int, MealSlot], SlotFill] = {}
    for fill in slots:
        _check_content(fill.recipe_id, fill.special)
        if fill.recipe_id is not None:
            recipe = repository.get_recipe(session, fill.recipe_id)
            if not fits_slot(recipe.meal_type, fill.slot):
                raise IncompatibleSlotError(fill.recipe_id)
        chosen[(fill.day, fill.slot)] = fill
    session.exec(delete(MealAssignment).where(col(MealAssignment.week_start) == week_start))
    for (day, slot), fill in chosen.items():
        session.add(
            MealAssignment(
                week_start=week_start,
                day=day,
                slot=slot,
                recipe_id=fill.recipe_id,
                special=None if fill.special is None else fill.special.value,
                note=fill.note,
            )
        )
    _commit(session)
    return get_week_plan(session, week_start)


def suggest_week(session: Session, week_start: date, seed: int | None = None) -> WeekPlanRead:
    """Fill the empty slots of a week with varied recipes; filled slots are untouched.

    Special meals (eating out, leftovers, free) are filled slots and stay as they are.

    The same ``seed`` on the same plan and catalogue gives the same result.
    """
    _check_position(week_start, 0)
    slots = _load_slots(session, week_start)
    meals = _meals(slots)
    catalogue = [meal_info(recipe) for recipe in repository.list_recipes(session)]
    rng = random.Random(seed)
    context = week_context(session, week_start)
    household = household_repo.get_household(session)
    fills = suggest_fills(
        meals,
        catalogue,
        rng,
        context,
        _occupied(slots),
        household.targets,
        household.required,
        household.avoided,
    )
    for index, meal in fills.items():
        position = slot_position(index)
        session.add(
            MealAssignment(
                week_start=week_start,
                day=position.day,
                slot=position.slot,
                recipe_id=meal.recipe_id,
            )
        )
    _commit(session)
    return get_week_plan(session, week_start)


def slot_candidates(
    session: Session, week_start: date, day: int, slot: MealSlot
) -> list[CandidateRead]:
    """Recipes compatible with a slot, ordered by the variety score they would give."""
    _check_position(week_start, day)
    meals = _meals(_load_slots(session, week_start))
    recipes = {r.id: r for r in repository.list_recipes(session)}
    catalogue = [meal_info(recipe) for recipe in recipes.values()]
    household = household_repo.get_household(session)
    return [
        CandidateRead(
            recipe=RecipeRead.model_validate(recipes[candidate.meal.recipe_id]),
            score_delta=candidate.score_delta,
            reason=candidate.reason,
            reason_code=candidate.reason_code,
            reason_params=candidate.reason_params,
            good_pick=candidate.good_pick,
        )
        for candidate in candidates_for_slot(
            meals,
            slot_index(day, slot),
            catalogue,
            week_context(session, week_start),
            household.targets,
            household.required,
            household.avoided,
        )
    ]


def copy_week(session: Session, week_start: date, from_week_start: date) -> WeekCopyRead:
    """Copy the meals of another week into the empty slots of ``week_start``.

    Special meals and notes are copied too. Never overwrites a filled slot and skips meals
    whose recipe is archived (they are counted in ``skipped_archived``). Raises
    :class:`InvalidWeekError` when the target is not a Monday and
    :class:`InvalidCopySourceError` when the source is not a Monday or is
    the target itself.
    """
    _check_position(week_start, 0)
    if not is_week_start(from_week_start) or from_week_start == week_start:
        raise InvalidCopySourceError(from_week_start)
    source = _load_slots(session, from_week_start)
    filled = set(_load_slots(session, week_start))
    copied = skipped = 0
    for (day, slot), planned in sorted(source.items()):
        if (day, slot) in filled:
            continue
        if planned.recipe is not None and planned.recipe.archived_at is not None:
            skipped += 1
            continue
        session.add(
            MealAssignment(
                week_start=week_start,
                day=day,
                slot=slot,
                recipe_id=None if planned.recipe is None else planned.recipe.id,
                special=None if planned.special is None else planned.special.value,
                note=planned.note,
            )
        )
        copied += 1
    _commit(session)
    return WeekCopyRead(
        plan=get_week_plan(session, week_start),
        copied=copied,
        skipped_archived=skipped,
        source_meals=len(source),
    )
