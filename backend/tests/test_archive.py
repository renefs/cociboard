"""Archived recipes: hidden from the catalogue and suggestions, kept in plans."""

from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

from cociboard import repository
from cociboard.schemas import RecipeUpdate
from cociboard.seed import SEED_RECIPES, seed_recipes

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


def archive(client: TestClient, recipe_id: int, archived: bool = True) -> dict[str, Any]:
    response = client.patch(f"/api/recipes/{recipe_id}", json={"archived": archived})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def test_archive_and_restore_round_trip(client: TestClient) -> None:
    recipe = make(client, "Paella", "both")
    assert client.get(f"/api/recipes/{recipe}").json()["archived"] is False
    assert archive(client, recipe)["archived"] is True
    assert "archived_at" not in client.get(f"/api/recipes/{recipe}").json()
    assert archive(client, recipe, False)["archived"] is False


def test_archiving_twice_keeps_the_first_timestamp(client: TestClient, session: Session) -> None:
    recipe = make(client, "Paella", "both")
    archive(client, recipe)
    first = repository.get_recipe(session, recipe).archived_at
    archive(client, recipe)
    assert repository.get_recipe(session, recipe).archived_at == first


def test_listing_hides_archived_unless_asked(client: TestClient) -> None:
    keep = make(client, "Keep", "both")
    gone = make(client, "Gone", "both")
    archive(client, gone)
    assert [r["id"] for r in client.get("/api/recipes").json()] == [keep]
    only = client.get("/api/recipes", params={"archived": "true"}).json()
    assert [r["id"] for r in only] == [gone]
    assert only[0]["archived"] is True


def test_archived_filters_still_apply(client: TestClient) -> None:
    gone = make(client, "Lentil stew", "lunch")
    archive(client, gone)
    make(client, "Soup", "both")
    found = client.get("/api/recipes", params={"archived": "true", "q": "lentil"}).json()
    assert [r["id"] for r in found] == [gone]
    assert client.get("/api/recipes", params={"archived": "true", "q": "soup"}).json() == []


def test_candidates_and_suggest_skip_archived(client: TestClient) -> None:
    live = make(client, "Live", "both")
    gone = make(client, "Gone", "both")
    archive(client, gone)
    candidates = client.get(f"/api/weeks/{MONDAY}/days/0/lunch/candidates").json()
    assert [c["recipe"]["id"] for c in candidates] == [live]
    plan = client.post(f"/api/weeks/{MONDAY}/suggest", json={"seed": 1}).json()
    used = {
        d[slot]["id"] for d in plan["days"] for slot in ("lunch", "dinner") if d[slot] is not None
    }
    assert used == {live}


def test_assigning_archived_recipe_is_422_with_code(client: TestClient) -> None:
    gone = make(client, "Gone", "both")
    archive(client, gone)
    response = put(client, 0, "lunch", gone)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "recipe_archived"
    assert detail["recipe_id"] == gone
    assert client.get(f"/api/weeks/{MONDAY}").json()["days"][0]["lunch"] is None


def test_plan_keeps_showing_archived_recipe_and_counts_it(client: TestClient) -> None:
    a = make(client, "A", "both")
    put(client, 0, "lunch", a)
    archive(client, a)
    plan = client.get(f"/api/weeks/{MONDAY}").json()
    assert plan["days"][0]["lunch"]["archived"] is True
    assert plan["variety"]["filled_slots"] == 1
    assert client.get(f"/api/recipes/{a}/usage").json() == {"count": 1}


def test_move_and_swap_with_archived_recipe_stay_allowed(client: TestClient) -> None:
    a = make(client, "A", "both")
    b = make(client, "B", "both")
    put(client, 0, "lunch", a)
    put(client, 1, "lunch", b)
    archive(client, a)
    moved = client.post(
        f"/api/weeks/{MONDAY}/move",
        json={"from_day": 0, "from_slot": "lunch", "to_day": 1, "to_slot": "lunch"},
    )
    assert moved.status_code == 200
    assert names(moved.json()) == {(0, "lunch"): "B", (1, "lunch"): "A"}
    cleared = client.delete(f"/api/weeks/{MONDAY}/days/1/lunch")
    assert cleared.status_code == 200


def test_undo_clear_week_restores_archived_recipe(client: TestClient) -> None:
    a = make(client, "A", "both")
    b = make(client, "B", "both")
    put(client, 0, "lunch", a)
    put(client, 0, "dinner", b)
    archive(client, a)
    before = client.get(f"/api/weeks/{MONDAY}").json()
    assert client.delete(f"/api/weeks/{MONDAY}").status_code == 200
    slots = [
        {"day": d["day"], "slot": slot, "recipe_id": d[slot]["id"]}
        for d in before["days"]
        for slot in ("lunch", "dinner")
        if d[slot] is not None
    ]
    restored = client.put(f"/api/weeks/{MONDAY}", json={"slots": slots})
    assert restored.status_code == 200
    assert names(restored.json()) == {(0, "lunch"): "A", (0, "dinner"): "B"}


def test_archiving_never_touches_planned_meals(client: TestClient) -> None:
    a = make(client, "A", "both")
    put(client, 0, "lunch", a)
    put(client, 3, "dinner", a, week="2026-11-02")
    archive(client, a)
    assert client.get(f"/api/recipes/{a}/usage").json() == {"count": 2}


def test_archived_flag_cannot_be_null(client: TestClient) -> None:
    a = make(client, "A", "both")
    assert client.patch(f"/api/recipes/{a}", json={"archived": None}).status_code == 422


def test_duplicate_name_reports_archived_clash(client: TestClient) -> None:
    gone = make(client, "Paella", "both")
    archive(client, gone)
    payload = {"name": "paella", "meal_type": "both", "protein": "none", "ingredients": ["x"]}
    response = client.post("/api/recipes", json=payload)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "duplicate_name"
    assert response.json()["detail"]["archived"] is True
    other = make(client, "Tortilla", "both")
    renamed = client.patch(f"/api/recipes/{other}", json={"name": "Paella"})
    assert renamed.status_code == 409
    assert renamed.json()["detail"]["archived"] is True


def test_seed_treats_archived_recipes_as_existing(session: Session) -> None:
    seed_recipes(session)
    first = repository.list_recipes(session)[0]
    repository.update_recipe(session, first.id or 0, RecipeUpdate(archived=True))
    assert seed_recipes(session).inserted == 0
    assert repository.count_recipes(session) == len(SEED_RECIPES)
