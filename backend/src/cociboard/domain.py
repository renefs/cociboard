"""Pure domain rules for recipes. No I/O, no framework imports."""

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


def fits_slot(meal_type: MealType, slot: MealSlot) -> bool:
    """Return whether a recipe of ``meal_type`` may be placed in ``slot``."""
    return meal_type is MealType.both or meal_type.value == slot.value
