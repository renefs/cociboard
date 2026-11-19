"""Pure domain rules for recipes. No I/O, no framework imports."""

import unicodedata
from datetime import date, timedelta
from enum import StrEnum


class MealType(StrEnum):
    """When a recipe may be served. ``both`` fits either slot."""

    lunch = "lunch"
    dinner = "dinner"
    both = "both"


class MealSlot(StrEnum):
    """A slot in the weekly grid."""

    lunch = "lunch"
    dinner = "dinner"


class SpecialMeal(StrEnum):
    """A slot that holds no recipe: a meal that is not cooked from the catalogue."""

    eating_out = "eating_out"
    leftovers = "leftovers"
    free = "free"


NOTE_MAX_LENGTH = 120


class Protein(StrEnum):
    """Main protein source of a recipe, used later for variety analysis."""

    meat = "meat"
    poultry = "poultry"
    fish = "fish"
    seafood = "seafood"
    eggs = "eggs"
    legumes = "legumes"
    dairy = "dairy"
    tofu = "tofu"
    none = "none"


class RecipeProperty(StrEnum):
    """Dietary or practical tags a recipe can carry."""

    vegetarian = "vegetarian"
    vegan = "vegan"
    gluten_free = "gluten_free"
    dairy_free = "dairy_free"
    quick = "quick"  # ready in 30 minutes or less
    spicy = "spicy"
    light = "light"
    kid_friendly = "kid_friendly"
    batch_cooking = "batch_cooking"


class IssueKind(StrEnum):
    """Kinds of variety findings (see ``variety.py``)."""

    repeated_recipe = "repeated_recipe"
    consecutive_protein = "consecutive_protein"
    protein_overload = "protein_overload"
    few_vegetarian = "few_vegetarian"
    little_fish = "little_fish"
    previous_week_protein = "previous_week_protein"
    recent_repeat = "recent_repeat"


class CandidateReason(StrEnum):
    """Why a recipe is (or is not) a good candidate for a slot (see ``suggest.py``)."""

    fits_week = "fits_week"
    adds_fish = "adds_fish"
    adds_vegetable_forward = "adds_vegetable_forward"
    new_protein = "new_protein"
    twice_in_a_row = "twice_in_a_row"
    protein_overload = "protein_overload"
    already_planned = "already_planned"
    already_planned_batch = "already_planned_batch"
    planned_recently = "planned_recently"


class IssueSeverity(StrEnum):
    """``warning`` marks slots in the grid; ``info`` is a gentle suggestion."""

    info = "info"
    warning = "warning"


def fits_slot(meal_type: MealType, slot: MealSlot) -> bool:
    """Return whether a recipe of ``meal_type`` may be placed in ``slot``."""
    return meal_type is MealType.both or meal_type.value == slot.value


def fold_text(text: str) -> str:
    """Return ``text`` case- and accent-folded for search ("Albóndigas" -> "albondigas")."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


DAYS_IN_WEEK = 7


def week_start_for(day: date) -> date:
    """Return the Monday of the ISO week that contains ``day``."""
    return day - timedelta(days=day.weekday())


def is_week_start(day: date) -> bool:
    """Whether ``day`` is a Monday, i.e. a valid week key."""
    return day.weekday() == 0


def is_valid_day_index(day: int) -> bool:
    """Whether ``day`` is a valid day index (0 = Monday ... 6 = Sunday)."""
    return 0 <= day < DAYS_IN_WEEK


def date_of(week_start: date, day: int) -> date:
    """Return the calendar date of day index ``day`` in the week starting ``week_start``."""
    return week_start + timedelta(days=day)
