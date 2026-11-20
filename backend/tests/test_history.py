"""Recipe history: pure functions, the recipe fields and ``GET /api/recipes/{id}/history``."""

from datetime import date
from typing import Any

from fastapi.testclient import TestClient

from cociboard.domain import MealSlot
from cociboard.history import (
    RecipeHistory,
    planned_meals,
    summarize_by_recipe,
    summarize_dates,
)
from cociboard.routers.weeks import get_today

TODAY = date(2026, 11, 19)  # a Thursday
MONDAY = date(2026, 11, 16)


def test_no_dates_means_never_planned() -> None:
    assert summarize_dates([], TODAY) == RecipeHistory(None, None, 0)


def test_past_future_and_today_split() -> None:
    dates = [date(2026, 11, 1), date(2026, 11, 19), date(2026, 11, 20), date(2026, 12, 1)]
    assert summarize_dates(dates, TODAY) == RecipeHistory(
        last_planned_on=date(2026, 11, 19),  # today counts as made
        next_planned_on=date(2026, 11, 20),
        times_planned=2,
    )


def test_only_upcoming_has_no_last_date() -> None:
    result = summarize_dates([date(2026, 12, 1), date(2026, 11, 25)], TODAY)
    assert result == RecipeHistory(None, date(2026, 11, 25), 0)


def test_summarize_by_recipe_uses_week_start_plus_day() -> None:
    rows = [(1, MONDAY, 0), (1, MONDAY, 6), (2, date(2026, 11, 23), 0)]
    result = summarize_by_recipe(rows, TODAY)
    assert result[1] == RecipeHistory(date(2026, 11, 16), date(2026, 11, 22), 1)
    assert result[2] == RecipeHistory(None, date(2026, 11, 23), 0)
    assert 3 not in result


def test_planned_meals_most_recent_first_dinner_before_lunch() -> None:
    rows = [
        (MONDAY, 0, MealSlot.dinner),
        (MONDAY, 0, MealSlot.lunch),
        (date(2026, 11, 23), 1, MealSlot.lunch),
    ]
    meals = planned_meals(rows)
    assert [(m.date.isoformat(), m.slot) for m in meals] == [
        ("2026-11-24", MealSlot.lunch),
        ("2026-11-16", MealSlot.dinner),
        ("2026-11-16", MealSlot.lunch),
    ]


def make(client: TestClient, name: str, **extra: Any) -> int:
    payload = {"name": name, "meal_type": "both", "protein": "fish", "ingredients": ["x"], **extra}
    response = client.post("/api/recipes", json=payload)
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def plan(client: TestClient, week: str, day: int, slot: str, recipe_id: int) -> None:
    response = client.put(f"/api/weeks/{week}/days/{day}/{slot}", json={"recipe_id": recipe_id})
    assert response.status_code == 200, response.text


def by_name(client: TestClient) -> dict[str, dict[str, Any]]:
    return {r["name"]: r for r in client.get("/api/recipes").json()}


def test_recipes_carry_their_history(client: TestClient) -> None:
    client.app.dependency_overrides[get_today] = lambda: TODAY  # type: ignore[attr-defined]
    a = make(client, "Alpha")
    make(client, "Beta")
    plan(client, "2026-11-09", 2, "lunch", a)  # 11 Nov, past
    plan(client, "2026-11-16", 1, "dinner", a)  # 17 Nov, past
    plan(client, "2026-11-23", 0, "lunch", a)  # 23 Nov, upcoming
    plan(client, "2026-11-30", 0, "lunch", a)  # 30 Nov, upcoming
    client.put("/api/weeks/2026-11-16/days/0/lunch", json={"special": "eating_out"})

    recipes = by_name(client)
    assert recipes["Alpha"]["last_planned_on"] == "2026-11-17"
    assert recipes["Alpha"]["next_planned_on"] == "2026-11-23"
    assert recipes["Alpha"]["times_planned"] == 2
    assert recipes["Beta"]["last_planned_on"] is None
    assert recipes["Beta"]["next_planned_on"] is None
    assert recipes["Beta"]["times_planned"] == 0
    one = client.get(f"/api/recipes/{a}").json()
    assert (one["last_planned_on"], one["times_planned"]) == ("2026-11-17", 2)


def test_history_endpoint(client: TestClient) -> None:
    client.app.dependency_overrides[get_today] = lambda: TODAY  # type: ignore[attr-defined]
    a = make(client, "Alpha")
    plan(client, "2026-11-16", 1, "dinner", a)
    plan(client, "2026-11-16", 1, "lunch", a)
    plan(client, "2026-11-23", 0, "lunch", a)

    body = client.get(f"/api/recipes/{a}/history").json()
    assert body["times_planned"] == 2
    assert body["last_planned_on"] == "2026-11-17"
    assert body["next_planned_on"] == "2026-11-23"
    assert [(m["date"], m["slot"], m["upcoming"]) for m in body["meals"]] == [
        ("2026-11-23", "lunch", True),
        ("2026-11-17", "dinner", False),
        ("2026-11-17", "lunch", False),
    ]
    assert body["meals"][0]["week_start"] == "2026-11-23"
    assert body["meals"][0]["day"] == 0


def test_history_limit_caps_the_list_but_not_the_totals(client: TestClient) -> None:
    client.app.dependency_overrides[get_today] = lambda: TODAY  # type: ignore[attr-defined]
    a = make(client, "Alpha")
    for day in range(4):
        plan(client, "2026-11-09", day, "lunch", a)

    body = client.get(f"/api/recipes/{a}/history", params={"limit": 2}).json()
    assert body["times_planned"] == 4
    assert len(body["meals"]) == 2
    assert body["meals"][0]["date"] == "2026-11-12"


def test_history_limit_is_validated(client: TestClient) -> None:
    a = make(client, "Alpha")
    assert client.get(f"/api/recipes/{a}/history", params={"limit": 0}).status_code == 422
    assert client.get(f"/api/recipes/{a}/history", params={"limit": 51}).status_code == 422
    assert client.get(f"/api/recipes/{a}/history", params={"limit": 50}).status_code == 200


def test_history_of_a_never_planned_recipe_is_empty(client: TestClient) -> None:
    a = make(client, "Alpha")
    body = client.get(f"/api/recipes/{a}/history").json()
    assert body == {
        "times_planned": 0,
        "last_planned_on": None,
        "next_planned_on": None,
        "meals": [],
    }


def test_history_of_unknown_recipe_is_404(client: TestClient) -> None:
    assert client.get("/api/recipes/99/history").status_code == 404
