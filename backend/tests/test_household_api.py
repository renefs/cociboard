"""``/api/settings/household`` and its effect on analysis, suggestions and candidates."""

from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

from cociboard.household import is_valid_time, validate_household
from cociboard.models import HouseholdSettingsRow

URL = "/api/settings/household"
MONDAY = "2026-10-26"

DEFAULTS = {
    "required_properties": [],
    "avoided_properties": [],
    "max_meals_per_protein": 4,
    "min_vegetarian_meals": 2,
    "min_fish_meals": 2,
    "lunch_time": "14:00",
    "dinner_time": "21:00",
}


def put(client: TestClient, **changes: Any) -> Any:
    return client.put(URL, json={**DEFAULTS, **changes})


def make(client: TestClient, name: str, protein: str = "none", *properties: str) -> int:
    response = client.post(
        "/api/recipes",
        json={
            "name": name,
            "meal_type": "both",
            "protein": protein,
            "ingredients": ["x"],
            "properties": list(properties),
        },
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def test_defaults_without_a_stored_row(client: TestClient, session: Session) -> None:
    response = client.get(URL)
    assert response.status_code == 200
    assert response.json() == DEFAULTS
    assert session.get(HouseholdSettingsRow, 1) is None  # reading writes nothing


def test_update_persists_and_normalises(client: TestClient) -> None:
    body = {
        "required_properties": ["gluten_free", "vegetarian", "vegetarian"],
        "avoided_properties": ["spicy"],
        "max_meals_per_protein": 3,
        "min_vegetarian_meals": 0,
        "min_fish_meals": 5,
        "lunch_time": "13:30",
        "dinner_time": "23:30",
    }
    response = client.put(URL, json=body)
    assert response.status_code == 200, response.text
    expected = {**body, "required_properties": ["vegetarian", "gluten_free"]}
    assert response.json() == expected
    assert client.get(URL).json() == expected
    again = put(client, max_meals_per_protein=6)  # a second save updates the same row
    assert again.json()["max_meals_per_protein"] == 6
    assert again.json()["required_properties"] == []


def test_invalid_codes(client: TestClient) -> None:
    cases: dict[str, dict[str, Any]] = {
        "invalid_time": {"lunch_time": "25:00"},
        "invalid_time ": {"dinner_time": "9:00"},
        "not_dietary": {"required_properties": ["spicy"]},
        "required_and_avoided": {
            "required_properties": ["vegan"],
            "avoided_properties": ["vegan"],
        },
    }
    for code, change in cases.items():
        response = put(client, **change)
        assert response.status_code == 422, response.text
        assert response.json() == {"detail": {"code": code.strip()}}
    assert client.get(URL).json() == DEFAULTS


def test_pydantic_validation(client: TestClient) -> None:
    for change in (
        {"max_meals_per_protein": 0},
        {"max_meals_per_protein": 15},
        {"min_fish_meals": -1},
        {"min_vegetarian_meals": 15},
        {"required_properties": ["nope"]},
        {"lunch_time": "toolong"},
    ):
        assert put(client, **change).status_code == 422, change
    assert client.put(URL, json={**DEFAULTS, "min_fish_meals": "x"}).status_code == 422


def test_pure_validation() -> None:
    assert is_valid_time("00:00") and is_valid_time("23:59")
    assert not any(is_valid_time(t) for t in ("24:00", "12:60", "1:00", "12:5", "", "ab:cd"))
    assert validate_household([], [], "14:00", "21:00") is None


def test_targets_reach_the_variety_report(client: TestClient) -> None:
    ids = [make(client, f"Meat {n}", "meat") for n in range(3)]
    for index, recipe_id in enumerate(ids):
        day = index * 2  # never consecutive
        r = client.put(f"/api/weeks/{MONDAY}/days/{day}/lunch", json={"recipe_id": recipe_id})
        assert r.status_code == 200
    assert client.get(f"/api/weeks/{MONDAY}/variety").json()["issues"] == []
    put(client, max_meals_per_protein=2)
    issues = client.get(f"/api/weeks/{MONDAY}/variety").json()["issues"]
    assert [(i["kind"], i["params"]["max"]) for i in issues] == [("protein_overload", 2)]
    plan_issues = client.get(f"/api/weeks/{MONDAY}").json()["variety"]["issues"]
    assert plan_issues == issues


def test_suggest_and_candidates_follow_the_preferences(client: TestClient) -> None:
    make(client, "Salad", "none", "vegetarian")
    make(client, "Curry", "none", "vegetarian", "spicy")
    make(client, "Steak", "meat")
    put(client, required_properties=["vegetarian"], avoided_properties=["spicy"])
    candidates = client.get(f"/api/weeks/{MONDAY}/days/0/lunch/candidates").json()
    assert candidates[0]["recipe"]["name"] == "Salad"
    outside = {c["recipe"]["name"]: c for c in candidates[1:]}
    assert set(outside) == {"Curry", "Steak"}
    assert all(c["reason_code"] == "outside_preferences" for c in outside.values())
    assert not any(c["good_pick"] for c in outside.values())
    plan = client.post(f"/api/weeks/{MONDAY}/suggest", json={"seed": 3}).json()
    assert {d[s]["name"] for d in plan["days"] for s in ("lunch", "dinner")} == {"Salad"}
