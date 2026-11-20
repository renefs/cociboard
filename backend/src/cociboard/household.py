"""Household preferences (ADR-0026): pure validation rules and defaults.

The settings are stored in a single row (``HouseholdSettingsRow``); this module holds what
needs no database: the defaults, the dietary subset and the consistency checks.
"""

import re

from cociboard.domain import RecipeProperty

DEFAULT_MAX_MEALS_PER_PROTEIN = 4
DEFAULT_MIN_VEGETARIAN_MEALS = 2
DEFAULT_MIN_FISH_MEALS = 2
DEFAULT_LUNCH_TIME = "14:00"
DEFAULT_DINNER_TIME = "21:00"

#: The properties that may be *required* (a diet); any property may be avoided.
DIETARY_PROPERTIES = (
    RecipeProperty.vegetarian,
    RecipeProperty.vegan,
    RecipeProperty.gluten_free,
    RecipeProperty.dairy_free,
)

_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def is_valid_time(value: str) -> bool:
    """``HH:MM`` on a 24-hour clock, zero-padded."""
    return _TIME.fullmatch(value) is not None


def validate_household(
    required: list[RecipeProperty],
    avoided: list[RecipeProperty],
    lunch_time: str,
    dinner_time: str,
) -> str | None:
    """The error code of the first problem, or ``None`` when the settings are consistent.

    Codes: ``not_dietary`` (a required property outside the dietary subset),
    ``required_and_avoided`` (the same property in both lists), ``invalid_time``.
    """
    if any(p not in DIETARY_PROPERTIES for p in required):
        return "not_dietary"
    if set(required) & set(avoided):
        return "required_and_avoided"
    if not is_valid_time(lunch_time) or not is_valid_time(dinner_time):
        return "invalid_time"
    return None


def normalised(properties: list[RecipeProperty]) -> list[RecipeProperty]:
    """Without duplicates, in enum order (a stable stored form)."""
    wanted = set(properties)
    return [p for p in RecipeProperty if p in wanted]
