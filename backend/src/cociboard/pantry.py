"""Pure pantry rules: which ingredients to suggest as staples. No I/O."""

from collections import Counter
from collections.abc import Collection, Iterable
from dataclasses import dataclass

from cociboard.shopping import ingredient_key

SUGGESTION_LIMIT = 8
SUGGESTION_MIN_RECIPES = 3


@dataclass(frozen=True)
class PantrySuggestion:
    """An ingredient used by many recipes that is not in the pantry yet."""

    key: str
    name: str
    recipe_count: int


def suggest_staples(
    recipes: Iterable[Iterable[str]],
    pantry_keys: Collection[str],
    limit: int = SUGGESTION_LIMIT,
    min_recipes: int = SUGGESTION_MIN_RECIPES,
) -> list[PantrySuggestion]:
    """The ingredients used by the most recipes, as pantry suggestions.

    ``recipes`` holds the ingredient lists of the active recipes. An ingredient counts once
    per recipe however often it is listed. Keys already in the pantry and ingredients used
    by fewer than ``min_recipes`` recipes are left out; the top ``limit`` come back by count
    (descending), then key. The display name is the first spelling met.
    """
    counts: Counter[str] = Counter()
    names: dict[str, str] = {}
    for ingredients in recipes:
        keys: set[str] = set()
        for text in ingredients:
            key = ingredient_key(text)
            if not key or key in keys:
                continue
            keys.add(key)
            names.setdefault(key, " ".join(text.split()))
        counts.update(keys)
    ranked = sorted(
        (key for key, n in counts.items() if n >= min_recipes and key not in pantry_keys),
        key=lambda key: (-counts[key], key),
    )
    return [PantrySuggestion(key, names[key], counts[key]) for key in ranked[:limit]]
