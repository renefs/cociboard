from pathlib import Path

import pytest

from cociboard.domain import STEP_MAX_LENGTH, STEPS_MAX_COUNT
from cociboard.recipe_import.errors import ImportFailure
from cociboard.recipe_import.parse import (
    clean_text,
    json_ld_blocks,
    parse_duration,
    parse_recipe,
    parse_servings,
    text_lines,
)

FIXTURES = Path(__file__).parent / "fixtures" / "recipe_import"
URL = "https://example.com/recipe"


def load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def page(recipe_json: str) -> str:
    return f'<script type="application/ld+json">{recipe_json}</script>'


def test_plain_recipe() -> None:
    draft = parse_recipe(load("plain.html"), URL)
    assert draft.name == "Lemon Chicken Traybake"
    assert draft.description == "A simple weeknight dinner."
    assert draft.servings == 4
    assert draft.prep_minutes == 60  # prepTime + cookTime
    assert draft.ingredients[0] == "8 chicken thighs"
    assert len(draft.ingredients) == 4
    assert draft.steps == [
        "Heat the oven to 200C.",
        "Toss everything in a tray.",
        "Roast for 45 minutes.",
    ]
    assert draft.source_url == URL
    assert draft.warnings == []


def test_graph_with_webpage_and_recipe() -> None:
    draft = parse_recipe(load("graph.html"), URL)
    assert draft.name == "Creamy Tomato Soup"
    assert draft.servings == 6
    assert draft.prep_minutes == 90  # totalTime
    assert draft.steps == ["Roast the tomatoes.", "Blend until smooth."]


def test_array_with_multiple_types() -> None:
    draft = parse_recipe(load("array_types.html"), URL)
    assert draft.name == "Weekend Pancakes"
    assert draft.servings == 4
    assert draft.prep_minutes == 45
    assert draft.steps == ["Mix.", "Fry."]


def test_how_to_sections_are_flattened_in_order() -> None:
    draft = parse_recipe(load("sections.html"), URL)
    assert draft.servings == 8
    assert draft.steps == [
        "Brown the mince.",
        "Simmer for 20 minutes.",
        "Layer sheets, sauce and bechamel.",
        "Bake for 40 minutes.",
    ]
    assert "time_unknown" in draft.warnings


def test_html_in_text_is_cleaned() -> None:
    draft = parse_recipe(load("html_in_text.html"), URL)
    assert draft.name == "Mac & Cheese Deluxe"
    assert draft.description == "Rich & creamy. Ready in no time!"
    assert draft.ingredients == ["200 g macaroni", "150 g cheddar & gruyere"]
    assert draft.steps == ["Boil the pasta.", "Make the sauce & combine."]


def test_invalid_json_block_is_skipped() -> None:
    draft = parse_recipe(load("invalid_then_valid.html"), URL)
    assert draft.name == "Garlic Bread"
    assert draft.servings == 8


def test_page_without_a_recipe() -> None:
    with pytest.raises(ImportFailure) as exc:
        parse_recipe(load("no_recipe.html"), URL)
    assert exc.value.code == "no_recipe_found"
    with pytest.raises(ImportFailure):
        parse_recipe("<html><body>nothing</body></html>", URL)


def test_recipe_without_a_name_does_not_count() -> None:
    with pytest.raises(ImportFailure):
        parse_recipe(page('{"@type":"Recipe","recipeIngredient":["a"]}'), URL)


def test_nested_main_entity_and_type_spellings() -> None:
    html = page(
        '{"@type":"WebPage","mainEntity":{"@type":"http://schema.org/Recipe","name":"Nested"}}'
    )
    assert parse_recipe(html, URL).name == "Nested"
    assert parse_recipe(page('{"@type":"schema:Recipe","name":"Prefixed"}'), URL).name == "Prefixed"


def test_missing_fields_warn() -> None:
    draft = parse_recipe(page('{"@type":"Recipe","name":"Bare"}'), URL)
    assert draft.warnings == ["servings_unknown", "time_unknown", "no_ingredients", "no_steps"]
    assert draft.description is None
    assert draft.ingredients == [] and draft.steps == []


def test_limits_are_enforced_with_warnings() -> None:
    import json

    recipe = {
        "@type": "Recipe",
        "name": "N" * 120,
        "recipeIngredient": [f"item {i}" for i in range(150)],
        "recipeInstructions": ["s" * 1500] + [f"step {i}" for i in range(80)],
    }
    draft = parse_recipe(page(json.dumps(recipe)), URL)
    assert len(draft.name) == 80
    assert len(draft.ingredients) == 100
    assert len(draft.steps) == STEPS_MAX_COUNT
    assert all(len(s) <= STEP_MAX_LENGTH for s in draft.steps)
    assert {"name_truncated", "ingredients_truncated", "steps_truncated"} <= set(draft.warnings)


def test_source_url_prefers_the_final_url() -> None:
    html = load("plain.html")
    final = "https://example.com/final"
    assert parse_recipe(html, final, "https://short.example/x").source_url == final
    too_long = "https://example.com/" + "a" * 600
    assert parse_recipe(html, too_long, "https://short.example/x").source_url == (
        "https://short.example/x"
    )
    assert parse_recipe(html, too_long, too_long).source_url is None


@pytest.mark.parametrize(
    ("value", "minutes"),
    [
        ("PT45M", 45),
        ("PT1H30M", 90),
        ("P0DT45M", 45),
        ("PT2H", 120),
        ("P1DT1H", 1500),
        ("pt10m", 10),
        ("PT90S", 2),
        ("PT0M", None),
        ("P", None),
        ("PT", None),
        ("45 minutes", None),
        ("P1M", None),
        ("PT1.5H", None),
        ("P30D", None),
        ("", None),
        (45, None),
        (None, None),
    ],
)
def test_parse_duration(value: object, minutes: int | None) -> None:
    assert parse_duration(value) == minutes


@pytest.mark.parametrize(
    ("value", "servings"),
    [
        ("4 servings", 4),
        ("Serves 6-8", 6),
        (4, 4),
        (4.0, 4),
        (["", "12 cookies"], 12),
        (["8"], 8),
        ("0", None),
        ("51", None),
        ("a few", None),
        ([], None),
        (None, None),
        (True, None),
    ],
)
def test_parse_servings(value: object, servings: int | None) -> None:
    assert parse_servings(value) == servings


def test_total_time_beats_prep_plus_cook_and_one_part_is_enough() -> None:
    both = page('{"@type":"Recipe","name":"A","totalTime":"PT20M","prepTime":"PT5M"}')
    assert parse_recipe(both, URL).prep_minutes == 20
    one = page('{"@type":"Recipe","name":"A","cookTime":"PT25M"}')
    assert parse_recipe(one, URL).prep_minutes == 25
    bad = page('{"@type":"Recipe","name":"A","totalTime":"soon","prepTime":"PT5M"}')
    assert parse_recipe(bad, URL).prep_minutes == 5


def test_text_helpers() -> None:
    assert clean_text("  a \n  b\t c ") == "a b c"
    assert clean_text("<b>x</b>&nbsp;&amp;<script>evil()</script> y") == "x & y"
    assert clean_text(7) == "7"
    assert clean_text(None) == "" and clean_text({"a": 1}) == "" and clean_text(True) == ""
    assert text_lines("a<br>b<br/>c\r\n\n d") == ["a", "b", "c", "d"]


def test_json_ld_blocks_tolerates_noise() -> None:
    html = (
        '<script type="application/ld+json">{"a": 1}</script>'
        '<script type="text/javascript">{"b": 2}</script>'
        '<script type="application/ld+json; charset=utf-8">\n<!-- {"c": "x\ny"} -->\n</script>'
        '<script type="application/ld+json">{broken</script>'
        '<script type="application/ld+json">{"unterminated": '
    )
    assert json_ld_blocks(html) == [{"a": 1}, {"c": "x\ny"}]


def test_deeply_nested_json_does_not_crash() -> None:
    deep = "[" * 500 + "]" * 500
    with pytest.raises(ImportFailure):
        parse_recipe(page(deep), URL)
