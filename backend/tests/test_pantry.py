"""Pure pantry suggestions."""

from cociboard.pantry import PantrySuggestion, suggest_staples


def recipes(*lists: list[str]) -> list[list[str]]:
    return list(lists)


def test_counts_once_per_recipe() -> None:
    data = recipes(["Sal", "sal", " SAL "], ["Sal"], ["Sal"], ["Pan"])
    assert suggest_staples(data, set()) == [PantrySuggestion("sal", "Sal", 3)]


def test_threshold_is_three_recipes() -> None:
    data = recipes(["Sal"], ["Sal"])
    assert suggest_staples(data, set()) == []
    assert suggest_staples(data, set(), min_recipes=2) == [PantrySuggestion("sal", "Sal", 2)]


def test_excludes_pantry_keys() -> None:
    data = recipes(["Sal", "Ajo"], ["Sal", "Ajo"], ["Sal", "Ajo"])
    assert [s.key for s in suggest_staples(data, {"sal"})] == ["ajo"]


def test_ranks_by_count_then_key_and_limits() -> None:
    data = recipes(*[["Sal", "Ajo", "Cebolla"]] * 3, ["Sal", "Cebolla"], ["Sal"])
    assert [(s.key, s.recipe_count) for s in suggest_staples(data, set())] == [
        ("sal", 5),
        ("cebolla", 4),
        ("ajo", 3),
    ]
    assert [s.key for s in suggest_staples(data, set(), limit=2)] == ["sal", "cebolla"]


def test_folds_accents_and_keeps_first_spelling() -> None:
    data = recipes(["Aceite de  Oliva"], ["aceite de oliva"], ["Aceite de oliva"])
    assert suggest_staples(data, set()) == [
        PantrySuggestion("aceite de oliva", "Aceite de Oliva", 3)
    ]
    data = recipes(["Cebollín"], ["cebollin"], ["CEBOLLIN"])
    assert [s.key for s in suggest_staples(data, set())] == ["cebollin"]


def test_blank_ingredients_are_ignored() -> None:
    assert suggest_staples(recipes(["  "], ["  "], ["  "]), set()) == []
