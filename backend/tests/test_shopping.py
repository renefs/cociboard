from cociboard.domain import MealSlot
from cociboard.shopping import PlannedMeal, aggregate, ingredient_key


def meal(day: int, slot: MealSlot, rid: int, name: str, *ingredients: str) -> PlannedMeal:
    return PlannedMeal(day, slot, rid, name, tuple(ingredients))


def test_key_folds_case_accents_and_whitespace() -> None:
    assert ingredient_key("  Aceite   de  OLIVA ") == "aceite de oliva"
    assert ingredient_key("Pimentón") == "pimenton"
    assert ingredient_key("   ") == ""


def test_empty_week() -> None:
    assert aggregate([]) == []


def test_merges_spellings_and_keeps_first_name() -> None:
    items = aggregate(
        [
            meal(0, MealSlot.lunch, 1, "A", "Pimentón", "Sal"),
            meal(1, MealSlot.dinner, 2, "B", "pimenton ", "sal"),
        ]
    )
    assert [(i.key, i.name) for i in items] == [("pimenton", "Pimentón"), ("sal", "Sal")]
    assert [m.recipe_name for m in items[0].meals] == ["A", "B"]


def test_inner_whitespace_collapsed_in_display_name() -> None:
    (item,) = aggregate([meal(0, MealSlot.lunch, 1, "A", " Aceite   de oliva ")])
    assert item.name == "Aceite de oliva"


def test_same_ingredient_twice_in_a_recipe_counts_once() -> None:
    (item,) = aggregate([meal(0, MealSlot.lunch, 1, "A", "Ajo", "ajo", "AJO")])
    assert len(item.meals) == 1


def test_empty_ingredients_skipped() -> None:
    assert aggregate([meal(0, MealSlot.lunch, 1, "A", "", "  ")]) == []


def test_sorted_by_key_and_meals_in_given_order() -> None:
    items = aggregate(
        [
            meal(0, MealSlot.lunch, 1, "A", "Zanahoria", "Ácido"),
            meal(0, MealSlot.dinner, 2, "B", "Arroz", "zanahoria"),
        ]
    )
    assert [i.key for i in items] == ["acido", "arroz", "zanahoria"]
    zanahoria = items[2]
    assert [(m.day, m.slot) for m in zanahoria.meals] == [(0, "lunch"), (0, "dinner")]
