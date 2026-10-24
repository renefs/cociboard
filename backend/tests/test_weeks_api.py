from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from cociboard.models import MealAssignment
from cociboard.routers.weeks import get_today

MONDAY = "2026-10-26"


def make(client: TestClient, name: str, meal_type: str) -> int:
    response = client.post(
        "/api/recipes",
        json={"name": name, "meal_type": meal_type, "protein": "none", "ingredients": ["x"]},
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def put(client: TestClient, day: int, slot: str, recipe_id: int, week: str = MONDAY) -> Any:
    return client.put(f"/api/weeks/{week}/days/{day}/{slot}", json={"recipe_id": recipe_id})


def names(plan: dict[str, Any]) -> dict[tuple[int, str], str]:
    return {
        (d["day"], slot): d[slot]["name"]
        for d in plan["days"]
        for slot in ("lunch", "dinner")
        if d[slot] is not None
    }


def test_empty_week_has_seven_dated_days(client: TestClient) -> None:
    response = client.get(f"/api/weeks/{MONDAY}")
    assert response.status_code == 200
    plan = response.json()
    assert plan["week_start"] == MONDAY
    assert [d["day"] for d in plan["days"]] == list(range(7))
    assert plan["days"][0]["date"] == MONDAY
    assert plan["days"][6]["date"] == "2026-11-01"
    assert all(d["lunch"] is None and d["dinner"] is None for d in plan["days"])


def test_current_week_uses_today(client: TestClient) -> None:
    client.app.dependency_overrides[get_today] = lambda: date(2026, 10, 29)  # type: ignore[attr-defined]
    plan = client.get("/api/weeks/current").json()
    assert plan["week_start"] == MONDAY


def test_assign_replace_and_clear(client: TestClient) -> None:
    a = make(client, "A", "both")
    b = make(client, "B", "lunch")
    plan = put(client, 2, "lunch", a).json()
    assert names(plan) == {(2, "lunch"): "A"}
    plan = put(client, 2, "lunch", b).json()
    assert names(plan) == {(2, "lunch"): "B"}
    assert client.get(f"/api/weeks/{MONDAY}").json() == plan
    cleared = client.delete(f"/api/weeks/{MONDAY}/days/2/lunch")
    assert cleared.status_code == 200
    assert names(cleared.json()) == {}
    assert client.delete(f"/api/weeks/{MONDAY}/days/2/lunch").status_code == 200


def test_weeks_are_independent(client: TestClient) -> None:
    a = make(client, "A", "both")
    put(client, 0, "dinner", a)
    other = client.get("/api/weeks/2026-11-02").json()
    assert names(other) == {}


def test_assign_validation(client: TestClient) -> None:
    lunch_only = make(client, "L", "lunch")
    dinner_only = make(client, "D", "dinner")
    assert put(client, 0, "dinner", lunch_only).status_code == 422
    assert put(client, 0, "lunch", dinner_only).status_code == 422
    assert put(client, 0, "lunch", lunch_only, week="2026-10-27").status_code == 422  # Tuesday
    assert put(client, 7, "lunch", lunch_only).status_code == 422
    assert put(client, -1, "lunch", lunch_only).status_code == 422
    assert put(client, 0, "brunch", lunch_only).status_code == 422
    assert put(client, 0, "lunch", 999).status_code == 404
    assert client.get("/api/weeks/2026-10-27").status_code == 422
    assert client.get("/api/weeks/not-a-date").status_code == 422
    assert client.delete("/api/weeks/2026-10-27/days/0/lunch").status_code == 422


def test_move_to_empty_slot(client: TestClient) -> None:
    a = make(client, "A", "both")
    put(client, 0, "lunch", a)
    response = client.post(
        f"/api/weeks/{MONDAY}/move",
        json={"from_day": 0, "from_slot": "lunch", "to_day": 3, "to_slot": "dinner"},
    )
    assert response.status_code == 200
    assert names(response.json()) == {(3, "dinner"): "A"}


def test_move_swaps_when_occupied(client: TestClient) -> None:
    a = make(client, "A", "both")
    b = make(client, "B", "both")
    put(client, 0, "lunch", a)
    put(client, 1, "dinner", b)
    response = client.post(
        f"/api/weeks/{MONDAY}/move",
        json={"from_day": 0, "from_slot": "lunch", "to_day": 1, "to_slot": "dinner"},
    )
    assert names(response.json()) == {(0, "lunch"): "B", (1, "dinner"): "A"}


def test_move_validates_both_recipes(client: TestClient) -> None:
    lunch_only = make(client, "L", "lunch")
    both = make(client, "B", "both")
    dinner_only = make(client, "D", "dinner")
    put(client, 0, "lunch", lunch_only)
    put(client, 1, "dinner", both)
    put(client, 2, "dinner", dinner_only)

    def move(**body: Any) -> Any:
        return client.post(f"/api/weeks/{MONDAY}/move", json=body)

    # lunch-only recipe cannot go to a dinner slot
    assert move(from_day=0, from_slot="lunch", to_day=5, to_slot="dinner").status_code == 422
    # swapping: the displaced dinner-only recipe cannot go to the lunch slot
    put(client, 4, "lunch", both)
    assert move(from_day=2, from_slot="dinner", to_day=4, to_slot="lunch").status_code == 422
    assert move(from_day=4, from_slot="lunch", to_day=2, to_slot="dinner").status_code == 422
    # nothing changed by the failed moves
    assert names(client.get(f"/api/weeks/{MONDAY}").json())[(4, "lunch")] == "B"
    assert names(client.get(f"/api/weeks/{MONDAY}").json())[(2, "dinner")] == "D"


def test_move_errors(client: TestClient) -> None:
    a = make(client, "A", "both")
    put(client, 0, "lunch", a)
    url = f"/api/weeks/{MONDAY}/move"
    empty = client.post(
        url, json={"from_day": 1, "from_slot": "lunch", "to_day": 2, "to_slot": "lunch"}
    )
    assert empty.status_code == 404
    bad_day = client.post(
        url, json={"from_day": 0, "from_slot": "lunch", "to_day": 9, "to_slot": "lunch"}
    )
    assert bad_day.status_code == 422
    bad_week = client.post(
        "/api/weeks/2026-10-27/move",
        json={"from_day": 0, "from_slot": "lunch", "to_day": 1, "to_slot": "lunch"},
    )
    assert bad_week.status_code == 422
    same = client.post(
        url, json={"from_day": 0, "from_slot": "lunch", "to_day": 0, "to_slot": "lunch"}
    )
    assert same.status_code == 200
    assert names(same.json()) == {(0, "lunch"): "A"}


@pytest.mark.parametrize("meal_type", ["lunch", "both"])
def test_deleting_recipe_removes_its_assignments(
    client: TestClient, session: Session, meal_type: str
) -> None:
    a = make(client, "A", meal_type)
    keep = make(client, "Keep", "both")
    put(client, 0, "lunch", a)
    put(client, 4, "lunch", a, week="2026-11-02")
    put(client, 1, "lunch", keep)
    assert client.delete(f"/api/recipes/{a}").status_code == 204
    rows = session.exec(select(MealAssignment)).all()
    assert [(r.day, r.recipe_id) for r in rows] == [(1, keep)]
    assert names(client.get(f"/api/weeks/{MONDAY}").json()) == {(1, "lunch"): "Keep"}


def test_week_plan_includes_variety_and_matches_variety_endpoint(client: TestClient) -> None:
    empty = client.get(f"/api/weeks/{MONDAY}").json()
    assert empty["variety"]["score"] is None
    assert empty["variety"]["filled_slots"] == 0
    a = make(client, "Same", "both")
    put(client, 0, "lunch", a)
    plan = put(client, 1, "lunch", a).json()
    assert plan["variety"]["score"] == 75
    [issue] = plan["variety"]["issues"]
    assert issue["kind"] == "repeated_recipe"
    assert issue["slots"] == [{"day": 0, "slot": "lunch"}, {"day": 1, "slot": "lunch"}]
    assert client.get(f"/api/weeks/{MONDAY}/variety").json() == plan["variety"]


def test_variety_endpoint_rejects_non_monday(client: TestClient) -> None:
    assert client.get("/api/weeks/2026-10-27/variety").status_code == 422


def test_clear_week_removes_only_that_week(client: TestClient, session: Session) -> None:
    a = make(client, "A", "both")
    put(client, 0, "lunch", a)
    put(client, 3, "dinner", a)
    put(client, 0, "lunch", a, week="2026-11-02")
    plan = client.delete(f"/api/weeks/{MONDAY}")
    assert plan.status_code == 200
    assert names(plan.json()) == {}
    assert plan.json()["variety"]["score"] is None
    assert names(client.get("/api/weeks/2026-11-02").json()) == {(0, "lunch"): "A"}
    assert client.delete(f"/api/weeks/{MONDAY}").status_code == 200  # idempotent
    assert client.delete("/api/weeks/2026-10-27").status_code == 422


def test_replace_week_is_atomic_and_validates(client: TestClient) -> None:
    a = make(client, "A", "both")
    b = make(client, "B", "dinner")
    put(client, 0, "lunch", a)
    body = {
        "slots": [
            {"day": 1, "slot": "dinner", "recipe_id": b},
            {"day": 2, "slot": "lunch", "recipe_id": a},
        ]
    }
    plan = client.put(f"/api/weeks/{MONDAY}", json=body).json()
    assert names(plan) == {(1, "dinner"): "B", (2, "lunch"): "A"}

    bad = {"slots": [{"day": 0, "slot": "lunch", "recipe_id": b}]}
    assert client.put(f"/api/weeks/{MONDAY}", json=bad).status_code == 422
    missing = {"slots": [{"day": 0, "slot": "lunch", "recipe_id": 999}]}
    assert client.put(f"/api/weeks/{MONDAY}", json=missing).status_code == 404
    assert names(client.get(f"/api/weeks/{MONDAY}").json()) == {
        (1, "dinner"): "B",
        (2, "lunch"): "A",
    }
    assert client.put(f"/api/weeks/{MONDAY}", json={"slots": []}).status_code == 200
    assert names(client.get(f"/api/weeks/{MONDAY}").json()) == {}


CONFLICT = "The plan changed meanwhile; reload and try again"


def test_assign_conflict_from_real_unique_violation(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from cociboard import planner

    soup = make(client, "Soup", "both")
    stew = make(client, "Stew", "both")
    assert put(client, 0, "lunch", soup).status_code == 200
    # Simulate a concurrent writer: the slot looked empty when we checked it.
    monkeypatch.setattr(planner, "_find", lambda *args, **kwargs: None)
    response = put(client, 0, "lunch", stew)
    assert response.status_code == 409
    assert response.json()["detail"] == CONFLICT
    monkeypatch.undo()
    # The session is usable again and the old plan is intact.
    assert names(client.get(f"/api/weeks/{MONDAY}").json()) == {(0, "lunch"): "Soup"}


@pytest.mark.parametrize("operation", ["assign", "move", "suggest", "replace"])
def test_integrity_error_on_commit_is_409_and_rolled_back(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch, operation: str
) -> None:
    soup = make(client, "Soup", "both")
    make(client, "Stew", "both")
    assert put(client, 0, "lunch", soup).status_code == 200

    def boom() -> None:
        raise IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed"))

    monkeypatch.setattr(session, "commit", boom)
    base = f"/api/weeks/{MONDAY}"
    if operation == "assign":
        response = put(client, 1, "dinner", soup)
    elif operation == "move":
        response = client.post(
            f"{base}/move",
            json={"from_day": 0, "from_slot": "lunch", "to_day": 2, "to_slot": "dinner"},
        )
    elif operation == "suggest":
        response = client.post(f"{base}/suggest", json={"seed": 1})
    else:
        response = client.put(
            base, json={"slots": [{"day": 3, "slot": "dinner", "recipe_id": soup}]}
        )
    assert response.status_code == 409
    assert response.json()["detail"] == CONFLICT
    monkeypatch.undo()
    assert names(client.get(base).json()) == {(0, "lunch"): "Soup"}
