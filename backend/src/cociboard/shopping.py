"""Pure shopping-list aggregation. No I/O, no framework imports."""

from dataclasses import dataclass, field

from cociboard.domain import MealSlot, fold_text


@dataclass(frozen=True)
class PlannedMeal:
    """One planned slot with the ingredients of its recipe."""

    day: int
    slot: MealSlot
    recipe_id: int
    recipe_name: str
    ingredients: tuple[str, ...]


@dataclass(frozen=True)
class MealRef:
    """A meal that uses an ingredient."""

    day: int
    slot: MealSlot
    recipe_id: int
    recipe_name: str


@dataclass
class ShoppingItem:
    """An ingredient to buy, with the meals that need it."""

    key: str
    name: str
    meals: list[MealRef] = field(default_factory=list)


def ingredient_key(text: str) -> str:
    """Grouping key of an ingredient: case/accent folded, trimmed, whitespace collapsed."""
    return " ".join(fold_text(text).split())


def aggregate(meals: list[PlannedMeal]) -> list[ShoppingItem]:
    """Group the ingredients of ``meals`` (in day/slot order) into items sorted by key.

    The display name is the first spelling met. An ingredient listed twice by one recipe
    counts once for that meal.
    """
    items: dict[str, ShoppingItem] = {}
    for meal in meals:
        ref = MealRef(meal.day, meal.slot, meal.recipe_id, meal.recipe_name)
        seen: set[str] = set()
        for text in meal.ingredients:
            key = ingredient_key(text)
            if not key or key in seen:
                continue
            seen.add(key)
            item = items.get(key)
            if item is None:
                item = items[key] = ShoppingItem(key=key, name=" ".join(text.split()))
            item.meals.append(ref)
    return [items[key] for key in sorted(items)]
