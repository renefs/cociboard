"""When recipes were planned: pure functions over meal dates (ADR-0027).

History is derived from the plan itself, so it is never stored. A meal is "past" when its
date is on or before ``today`` (today's meals count as made) and "upcoming" after it.
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from cociboard.domain import MealSlot, date_of

HISTORY_DEFAULT_LIMIT = 10
HISTORY_MAX_LIMIT = 50


@dataclass(frozen=True)
class RecipeHistory:
    """Planning facts about one recipe, relative to ``today``."""

    last_planned_on: date | None = None
    next_planned_on: date | None = None
    times_planned: int = 0


@dataclass(frozen=True)
class PlannedMeal:
    """One planned meal of a recipe."""

    week_start: date
    day: int
    slot: MealSlot
    date: date  # last: a field named ``date`` shadows the type for the annotations after it


def summarize_dates(dates: Iterable[date], today: date) -> RecipeHistory:
    """History of one recipe from the dates of its planned meals."""
    past = [d for d in dates if d <= today]
    future = [d for d in dates if d > today]
    return RecipeHistory(
        last_planned_on=max(past, default=None),
        next_planned_on=min(future, default=None),
        times_planned=len(past),
    )


def summarize_by_recipe(
    rows: Iterable[tuple[int, date, int]], today: date
) -> dict[int, RecipeHistory]:
    """History per recipe id from ``(recipe_id, week_start, day)`` rows.

    Recipes without any row are absent from the result.
    """
    dates: dict[int, list[date]] = defaultdict(list)
    for recipe_id, week_start, day in rows:
        dates[recipe_id].append(date_of(week_start, day))
    return {recipe_id: summarize_dates(values, today) for recipe_id, values in dates.items()}


_SLOT_ORDER = {MealSlot.lunch: 0, MealSlot.dinner: 1}


def planned_meals(rows: Iterable[tuple[date, int, MealSlot]]) -> list[PlannedMeal]:
    """``(week_start, day, slot)`` rows as meals, most recent first (dinner before lunch)."""
    meals = [PlannedMeal(w, d, MealSlot(s), date_of(w, d)) for w, d, s in rows]
    return sorted(meals, key=lambda m: (m.date, _SLOT_ORDER[m.slot]), reverse=True)
