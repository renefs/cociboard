from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from cociboard import repository
from cociboard.config import get_settings
from cociboard.db import get_engine
from cociboard.domain import MealType
from cociboard.main import create_app
from cociboard.seed import SEED_RECIPES, seed_if_empty, seed_recipes


def test_seed_is_idempotent(session: Session) -> None:
    assert seed_recipes(session) == len(SEED_RECIPES)
    assert seed_recipes(session) == 0
    assert repository.count_recipes(session) == len(SEED_RECIPES)


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
