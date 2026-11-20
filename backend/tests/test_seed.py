from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from cociboard import repository
from cociboard.config import get_settings
from cociboard.db import get_engine
from cociboard.domain import SERVINGS_MAX, SERVINGS_MIN, STEP_MAX_LENGTH, MealType
from cociboard.main import create_app
from cociboard.models import Recipe
from cociboard.seed import SEED_RECIPES, seed_if_empty, seed_recipes, should_fill_content


def _insert_old_style(session: Session) -> None:
    """Insert every seed recipe the way pre-v0.27.0 releases did: no steps, no servings."""
    for data in SEED_RECIPES:
        repository.create_recipe(session, data.model_copy(update={"steps": [], "servings": None}))


def _by_name(session: Session, name: str) -> Recipe:
    return next(r for r in session.exec(select(Recipe)) if r.name.lower() == name.lower())


def test_seed_is_idempotent(session: Session) -> None:
    assert seed_recipes(session) == (len(SEED_RECIPES), 0)
    assert seed_recipes(session) == (0, 0)
    assert repository.count_recipes(session) == len(SEED_RECIPES)


def test_every_seed_recipe_has_steps_and_servings() -> None:
    for recipe in SEED_RECIPES:
        assert recipe.servings is not None, recipe.name
        assert SERVINGS_MIN <= recipe.servings <= SERVINGS_MAX, recipe.name
        assert 4 <= len(recipe.steps) <= 8, recipe.name
        for step in recipe.steps:
            assert step.strip() == step and step, recipe.name
            assert len(step) <= STEP_MAX_LENGTH, recipe.name


def test_fresh_seed_stores_steps_and_servings(session: Session) -> None:
    assert seed_recipes(session).inserted == 33
    for recipe in session.exec(select(Recipe)):
        assert recipe.servings is not None
        assert 4 <= len(recipe.steps) <= 8


def test_old_style_database_is_filled(session: Session) -> None:
    _insert_old_style(session)
    assert seed_recipes(session) == (0, len(SEED_RECIPES))
    for recipe in session.exec(select(Recipe)):
        assert recipe.servings is not None and recipe.steps
    assert seed_recipes(session) == (0, 0)


def test_archived_old_recipe_is_filled_too(session: Session) -> None:
    _insert_old_style(session)
    old = _by_name(session, "Porrusalda")
    old.archived_at = datetime(2026, 1, 1, tzinfo=UTC)
    session.add(old)
    session.commit()
    assert seed_recipes(session).filled == len(SEED_RECIPES)
    assert _by_name(session, "Porrusalda").steps


def test_user_edited_recipes_are_not_touched(session: Session) -> None:
    _insert_old_style(session)
    with_steps = _by_name(session, "Porrusalda")
    with_steps.steps = ["Mi paso"]
    only_servings = _by_name(session, "Croquetas de jamón")
    only_servings.servings = 2
    session.add(with_steps)
    session.add(only_servings)
    session.commit()
    assert seed_recipes(session) == (0, len(SEED_RECIPES) - 2)
    assert _by_name(session, "Porrusalda").steps == ["Mi paso"]
    assert _by_name(session, "Porrusalda").servings is None
    assert _by_name(session, "Croquetas de jamón").steps == []
    assert _by_name(session, "Croquetas de jamón").servings == 2


def test_seed_matches_names_case_insensitively(session: Session) -> None:
    repository.create_recipe(
        session,
        SEED_RECIPES[0].model_copy(
            update={"name": SEED_RECIPES[0].name.upper(), "steps": [], "servings": None}
        ),
    )
    result = seed_recipes(session)
    assert result == (len(SEED_RECIPES) - 1, 1)
    assert repository.count_recipes(session) == len(SEED_RECIPES)
    assert _by_name(session, SEED_RECIPES[0].name).steps == SEED_RECIPES[0].steps


@pytest.mark.parametrize(
    ("steps", "servings", "expected"),
    [
        ([], None, True),
        (["Mezcla."], None, False),
        ([], 4, False),
        (["Mezcla."], 4, False),
    ],
)
def test_should_fill_content(steps: list[str], servings: int | None, expected: bool) -> None:
    assert should_fill_content(steps, servings) is expected


def test_seed_if_empty_skips_populated_db(session: Session) -> None:
    assert seed_if_empty(session) == len(SEED_RECIPES)
    assert seed_if_empty(session) == 0


def test_seed_if_empty_respects_user_data(session: Session) -> None:
    seed_recipes(session)
    for recipe in repository.list_recipes(session)[1:]:
        repository.delete_recipe(session, recipe.id or 0)
    assert seed_if_empty(session) == 0
    assert repository.count_recipes(session) == 1


def test_seed_catalogue_shape() -> None:
    assert len(SEED_RECIPES) == 33
    names = [r.name.lower() for r in SEED_RECIPES]
    assert len(set(names)) == len(names)
    counts = Counter(r.meal_type for r in SEED_RECIPES)
    assert counts == {MealType.lunch: 10, MealType.dinner: 10, MealType.both: 13}
    assert len({r.protein for r in SEED_RECIPES}) >= 7


def test_seed_property_consistency() -> None:
    from cociboard.domain import RecipeProperty as P

    for recipe in SEED_RECIPES:
        props = set(recipe.properties)
        if P.vegan in props:
            assert {P.vegetarian, P.dairy_free} <= props, recipe.name
        if P.quick in props:
            assert recipe.prep_minutes is not None and recipe.prep_minutes <= 30, recipe.name


def test_startup_seeds_when_enabled(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COCIBOARD_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    get_settings.cache_clear()
    get_engine.cache_clear()
    try:
        with TestClient(create_app()) as client:
            assert len(client.get("/api/recipes").json()) == len(SEED_RECIPES)
            assert len(client.get("/api/recipes?slot=dinner").json()) == 23
    finally:
        get_engine().dispose()
        get_settings.cache_clear()
        get_engine.cache_clear()


def test_startup_skips_seed_when_disabled(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COCIBOARD_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("COCIBOARD_SEED_ON_STARTUP", "false")
    get_settings.cache_clear()
    get_engine.cache_clear()
    try:
        with TestClient(create_app()) as client:
            assert client.get("/api/recipes").json() == []
    finally:
        get_engine().dispose()
        get_settings.cache_clear()
        get_engine.cache_clear()
