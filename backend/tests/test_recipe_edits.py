from typing import Any

from fastapi.testclient import TestClient

MONDAY = "2026-03-02"
NEXT_MONDAY = "2026-03-09"


def make(client: TestClient, name: str, meal_type: str = "both") -> int:
    response = client.post(
        "/api/recipes",
        json={"name": name, "meal_type": meal_type, "protein": "none", "ingredients": ["x"]},
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def put(client: TestClient, week: str, day: int, slot: str, recipe_id: int) -> None:
    response = client.put(f"/api/weeks/{week}/days/{day}/{slot}", json={"recipe_id": recipe_id})
    assert response.status_code == 200, response.text


def slots_of(client: TestClient, week: str) -> dict[tuple[int, str], str]:
    plan: dict[str, Any] = client.get(f"/api/weeks/{week}").json()
    return {(d["day"], s): d[s]["name"] for d in plan["days"] for s in ("lunch", "dinner") if d[s]}


def test_usage_counts_across_weeks(client: TestClient) -> None:
    recipe = make(client, "Paella")
    assert client.get(f"/api/recipes/{recipe}/usage").json() == {"count": 0}
    put(client, MONDAY, 0, "lunch", recipe)
    put(client, MONDAY, 1, "dinner", recipe)
    put(client, NEXT_MONDAY, 2, "lunch", recipe)
    assert client.get(f"/api/recipes/{recipe}/usage").json() == {"count": 3}


def test_usage_not_found(client: TestClient) -> None:
    assert client.get("/api/recipes/99/usage").status_code == 404


def test_meal_type_change_conflict_lists_slots(client: TestClient) -> None:
    recipe = make(client, "Paella")
    put(client, NEXT_MONDAY, 3, "dinner", recipe)
    put(client, MONDAY, 0, "lunch", recipe)
    put(client, MONDAY, 1, "dinner", recipe)
    response = client.patch(f"/api/recipes/{recipe}", json={"meal_type": "lunch"})
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "meal_type_conflict"
    assert detail["conflicts"] == [
        {"week_start": MONDAY, "day": 1, "slot": "dinner"},
        {"week_start": NEXT_MONDAY, "day": 3, "slot": "dinner"},
    ]
    # Nothing changed.
    assert client.get(f"/api/recipes/{recipe}").json()["meal_type"] == "both"
    assert client.get(f"/api/recipes/{recipe}/usage").json() == {"count": 3}


def test_force_removes_incompatible_assignments_only(client: TestClient) -> None:
    recipe = make(client, "Paella")
    other = make(client, "Tortilla")
    put(client, MONDAY, 0, "lunch", recipe)
    put(client, MONDAY, 1, "dinner", recipe)
    put(client, MONDAY, 2, "dinner", other)
    response = client.patch(f"/api/recipes/{recipe}?force=true", json={"meal_type": "lunch"})
    assert response.status_code == 200
    assert response.json()["meal_type"] == "lunch"
    assert slots_of(client, MONDAY) == {(0, "lunch"): "Paella", (2, "dinner"): "Tortilla"}


def test_compatible_changes_never_conflict(client: TestClient) -> None:
    recipe = make(client, "Paella", "lunch")
    put(client, MONDAY, 0, "lunch", recipe)
    assert client.patch(f"/api/recipes/{recipe}", json={"meal_type": "both"}).status_code == 200
    assert client.patch(f"/api/recipes/{recipe}", json={"name": "Paella 2"}).status_code == 200
    assert client.patch(f"/api/recipes/{recipe}", json={"meal_type": "lunch"}).status_code == 200
    assert slots_of(client, MONDAY) == {(0, "lunch"): "Paella 2"}


def test_unused_recipe_meal_type_change(client: TestClient) -> None:
    recipe = make(client, "Paella")
    response = client.patch(f"/api/recipes/{recipe}", json={"meal_type": "dinner"})
    assert response.status_code == 200


def test_duplicate_name_409_has_code(client: TestClient) -> None:
    make(client, "Paella")
    other = make(client, "Tortilla")
    response = client.patch(f"/api/recipes/{other}", json={"name": "paella"})
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "duplicate_name"
    assert detail["archived"] is False
