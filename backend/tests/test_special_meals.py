"""Special meals (eating out, leftovers, free) and slot notes (v0.13.0)."""

import random
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from cociboard.domain import MealType, Protein
from cociboard.models import MealAssignment
from cociboard.suggest import candidates_for_slot, suggest_fills
from cociboard.variety import MealInfo, analyze_week

MONDAY = "2026-10-26"
NEXT = "2026-11-02"
PREVIOUS = "2026-10-19"


def make(
    client: TestClient, name: str, meal_type: str = "both", protein: str = "meat", **extra: Any
) -> int:
    response = client.post(
        "/api/recipes",
        json={
            "name": name,
            "meal_type": meal_type,
            "protein": protein,
            "ingredients": [f"{name} ingredient"],
            **extra,
        },
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def slot_url(day: int, slot: str, week: str = MONDAY) -> str:
    return f"/api/weeks/{week}/days/{day}/{slot}"


def put(client: TestClient, day: int, slot: str, body: dict[str, Any], week: str = MONDAY) -> Any:
    return client.put(slot_url(day, slot, week), json=body)


def day_of(plan: dict[str, Any], day: int) -> dict[str, Any]:
    days: dict[str, Any] = plan["days"][day]
    return days


# ---- assign ----


@pytest.mark.parametrize("special", ["eating_out", "leftovers", "free"])
def test_assign_special(client: TestClient, special: str) -> None:
    response = put(client, 2, "dinner", {"special": special})
    assert response.status_code == 200, response.text
    day = day_of(response.json(), 2)
    assert day["dinner"] is None
    assert day["dinner_special"] == special
    assert day["dinner_note"] is None
    assert day["lunch_special"] is None
    assert day["lunch_note"] is None


def test_special_fits_any_slot_and_replaces_a_recipe(client: TestClient) -> None:
    dinner_only = make(client, "Stew", "dinner")
    put(client, 0, "dinner", {"recipe_id": dinner_only, "note": "old"})
    day = day_of(put(client, 0, "dinner", {"special": "free"}).json(), 0)
    assert day["dinner"] is None
    assert day["dinner_special"] == "free"
    assert day["dinner_note"] is None  # the note sent is the note stored
    assert put(client, 0, "lunch", {"special": "leftovers"}).status_code == 200


def test_recipe_replaces_a_special(client: TestClient) -> None:
    recipe = make(client, "Soup")
    put(client, 1, "lunch", {"special": "eating_out", "note": "Ana's birthday"})
    day = day_of(put(client, 1, "lunch", {"recipe_id": recipe}).json(), 1)
    assert day["lunch"]["name"] == "Soup"
    assert day["lunch_special"] is None
    assert day["lunch_note"] is None


def test_assign_with_note_is_trimmed(client: TestClient) -> None:
    recipe = make(client, "Soup")
    day = day_of(
        put(client, 0, "lunch", {"recipe_id": recipe, "note": "  Double batch  "}).json(), 0
    )
    assert day["lunch_note"] == "Double batch"
    day = day_of(put(client, 0, "lunch", {"recipe_id": recipe, "note": "   "}).json(), 0)
    assert day["lunch_note"] is None
    day = day_of(put(client, 0, "lunch", {"special": "free", "note": "x" * 120}).json(), 0)
    assert day["lunch_note"] == "x" * 120


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"note": "only a note"},
        {"recipe_id": 1, "special": "free"},
        {"special": "takeaway"},
        {"special": "free", "note": "x" * 121},
        {"special": None, "recipe_id": None},
    ],
)
def test_invalid_assign_bodies_are_422(client: TestClient, body: dict[str, Any]) -> None:
    make(client, "Soup")
    assert put(client, 0, "lunch", body).status_code == 422
    assert all(d["lunch"] is None for d in client.get(f"/api/weeks/{MONDAY}").json()["days"])


def test_archived_and_incompatible_recipes_are_still_refused(client: TestClient) -> None:
    dinner = make(client, "Stew", "dinner")
    assert put(client, 0, "lunch", {"recipe_id": dinner}).status_code == 422
    assert put(client, 0, "lunch", {"recipe_id": 999}).status_code == 404
    client.patch(f"/api/recipes/{dinner}", json={"archived": True})
    detail = put(client, 0, "dinner", {"recipe_id": dinner}).json()["detail"]
    assert detail["code"] == "recipe_archived"


# ---- notes ----


def patch_note(
    client: TestClient, day: int, slot: str, note: str | None, week: str = MONDAY
) -> Any:
    return client.patch(f"{slot_url(day, slot, week)}/note", json={"note": note})


def test_note_set_edit_and_clear(client: TestClient) -> None:
    recipe = make(client, "Soup")
    put(client, 0, "lunch", {"recipe_id": recipe})
    put(client, 0, "dinner", {"special": "leftovers"})

    plan = patch_note(client, 0, "lunch", " Double batch ").json()
    assert day_of(plan, 0)["lunch_note"] == "Double batch"
    assert day_of(plan, 0)["lunch"]["name"] == "Soup"
    plan = patch_note(client, 0, "dinner", "From Monday").json()
    assert day_of(plan, 0)["dinner_note"] == "From Monday"
    assert day_of(plan, 0)["dinner_special"] == "leftovers"

    assert day_of(patch_note(client, 0, "lunch", None).json(), 0)["lunch_note"] is None
    assert day_of(patch_note(client, 0, "dinner", "   ").json(), 0)["dinner_note"] is None


def test_note_errors(client: TestClient) -> None:
    assert patch_note(client, 0, "lunch", "hello").status_code == 404  # empty slot
    put(client, 0, "lunch", {"special": "free"})
    assert patch_note(client, 0, "lunch", "x" * 121).status_code == 422
    assert client.patch(f"{slot_url(0, 'lunch')}/note", json={}).status_code == 422
    assert patch_note(client, 0, "lunch", "ok", week="2026-10-27").status_code == 422
    assert client.patch(f"{slot_url(9, 'lunch')}/note", json={"note": "a"}).status_code == 422


def test_clearing_a_slot_removes_its_note(client: TestClient) -> None:
    put(client, 0, "lunch", {"special": "free", "note": "hi"})
    plan = client.delete(slot_url(0, "lunch")).json()
    assert day_of(plan, 0)["lunch_special"] is None
    assert day_of(plan, 0)["lunch_note"] is None


# ---- move / swap ----


def test_move_special_with_its_note_to_an_empty_slot(client: TestClient) -> None:
    put(client, 0, "dinner", {"special": "eating_out", "note": "Ana"})
    plan = client.post(
        f"/api/weeks/{MONDAY}/move",
        json={"from_day": 0, "from_slot": "dinner", "to_day": 3, "to_slot": "lunch"},
    ).json()
    assert day_of(plan, 0)["dinner_special"] is None
    assert day_of(plan, 0)["dinner_note"] is None
    assert day_of(plan, 3)["lunch_special"] == "eating_out"
    assert day_of(plan, 3)["lunch_note"] == "Ana"


def test_swap_special_and_recipe_swaps_notes(client: TestClient) -> None:
    recipe = make(client, "Soup")
    put(client, 0, "lunch", {"recipe_id": recipe, "note": "batch"})
    put(client, 1, "dinner", {"special": "free", "note": "late"})
    plan = client.post(
        f"/api/weeks/{MONDAY}/move",
        json={"from_day": 0, "from_slot": "lunch", "to_day": 1, "to_slot": "dinner"},
    ).json()
    assert day_of(plan, 0)["lunch"] is None
    assert day_of(plan, 0)["lunch_special"] == "free"
    assert day_of(plan, 0)["lunch_note"] == "late"
    assert day_of(plan, 1)["dinner"]["name"] == "Soup"
    assert day_of(plan, 1)["dinner_special"] is None
    assert day_of(plan, 1)["dinner_note"] == "batch"


def test_fit_check_applies_only_to_recipes(client: TestClient) -> None:
    dinner_only = make(client, "Stew", "dinner")
    put(client, 0, "dinner", {"recipe_id": dinner_only})
    put(client, 0, "lunch", {"special": "free"})
    # Swapping would put the dinner-only recipe into the lunch slot.
    refused = client.post(
        f"/api/weeks/{MONDAY}/move",
        json={"from_day": 0, "from_slot": "lunch", "to_day": 0, "to_slot": "dinner"},
    )
    assert refused.status_code == 422
    # A special moving into an empty lunch is fine, and so is a special swap with a special.
    put(client, 1, "dinner", {"special": "leftovers"})
    ok = client.post(
        f"/api/weeks/{MONDAY}/move",
        json={"from_day": 1, "from_slot": "dinner", "to_day": 0, "to_slot": "lunch"},
    )
    assert ok.status_code == 200
    assert day_of(ok.json(), 0)["lunch_special"] == "leftovers"
    assert day_of(ok.json(), 1)["dinner_special"] == "free"


# ---- replace (undo) ----


def test_replace_week_restores_specials_and_notes(client: TestClient) -> None:
    recipe = make(client, "Soup")
    put(client, 0, "lunch", {"recipe_id": recipe, "note": "batch"})
    put(client, 0, "dinner", {"special": "eating_out", "note": "Ana"})
    put(client, 4, "lunch", {"special": "free"})
    before = client.get(f"/api/weeks/{MONDAY}").json()
    client.delete(f"/api/weeks/{MONDAY}")
    assert all(
        d["lunch_special"] is None for d in client.get(f"/api/weeks/{MONDAY}").json()["days"]
    )

    slots = [
        {"day": 0, "slot": "lunch", "recipe_id": recipe, "note": "batch"},
        {"day": 0, "slot": "dinner", "special": "eating_out", "note": "Ana"},
        {"day": 4, "slot": "lunch", "special": "free"},
    ]
    response = client.put(f"/api/weeks/{MONDAY}", json={"slots": slots})
    assert response.status_code == 200, response.text
    assert response.json() == before


@pytest.mark.parametrize(
    "fill",
    [
        {"day": 0, "slot": "lunch"},
        {"day": 0, "slot": "lunch", "recipe_id": 1, "special": "free"},
        {"day": 0, "slot": "lunch", "special": "nope"},
    ],
)
def test_replace_week_rejects_invalid_fills(client: TestClient, fill: dict[str, Any]) -> None:
    make(client, "Soup")
    put(client, 5, "lunch", {"special": "free"})
    assert client.put(f"/api/weeks/{MONDAY}", json={"slots": [fill]}).status_code == 422
    assert day_of(client.get(f"/api/weeks/{MONDAY}").json(), 5)["lunch_special"] == "free"


# ---- copy ----


def test_copy_carries_specials_and_notes_into_empty_slots_only(client: TestClient) -> None:
    recipe = make(client, "Soup")
    put(client, 0, "lunch", {"recipe_id": recipe, "note": "batch"}, week=PREVIOUS)
    put(client, 0, "dinner", {"special": "eating_out", "note": "Ana"}, week=PREVIOUS)
    put(client, 1, "lunch", {"special": "leftovers"}, week=PREVIOUS)
    put(client, 1, "dinner", {"special": "free", "note": "source"}, week=PREVIOUS)
    put(client, 1, "dinner", {"special": "leftovers", "note": "target"}, week=MONDAY)

    result = client.post(f"/api/weeks/{MONDAY}/copy", json={"from_week_start": PREVIOUS}).json()
    assert result["copied"] == 3
    assert result["source_meals"] == 4
    plan = result["plan"]
    assert day_of(plan, 0)["lunch"]["name"] == "Soup"
    assert day_of(plan, 0)["lunch_note"] == "batch"
    assert day_of(plan, 0)["dinner_special"] == "eating_out"
    assert day_of(plan, 0)["dinner_note"] == "Ana"
    assert day_of(plan, 1)["lunch_special"] == "leftovers"
    assert day_of(plan, 1)["dinner_special"] == "leftovers"  # not overwritten
    assert day_of(plan, 1)["dinner_note"] == "target"


def test_copy_still_skips_archived_recipes_but_not_specials(client: TestClient) -> None:
    recipe = make(client, "Soup")
    put(client, 0, "lunch", {"recipe_id": recipe, "note": "n"}, week=PREVIOUS)
    put(client, 0, "dinner", {"special": "free"}, week=PREVIOUS)
    client.patch(f"/api/recipes/{recipe}", json={"archived": True})
    result = client.post(f"/api/weeks/{MONDAY}/copy", json={"from_week_start": PREVIOUS}).json()
    assert (result["copied"], result["skipped_archived"]) == (1, 1)
    assert day_of(result["plan"], 0)["lunch"] is None
    assert day_of(result["plan"], 0)["dinner_special"] == "free"


# ---- suggest ----


def test_suggest_never_fills_a_special_slot(client: TestClient, session: Session) -> None:
    for n in range(20):
        make(client, f"Recipe {n}", protein=["meat", "fish", "legumes", "eggs"][n % 4])
    put(client, 0, "lunch", {"special": "eating_out", "note": "Ana"})
    put(client, 3, "dinner", {"special": "free"})
    plan = client.post(f"/api/weeks/{MONDAY}/suggest", json={"seed": 4}).json()
    assert day_of(plan, 0)["lunch"] is None
    assert day_of(plan, 0)["lunch_special"] == "eating_out"
    assert day_of(plan, 0)["lunch_note"] == "Ana"
    assert day_of(plan, 3)["dinner"] is None
    filled = [
        (d["day"], slot)
        for d in plan["days"]
        for slot in ("lunch", "dinner")
        if d[slot] is not None
    ]
    assert len(filled) == 12
    rows = session.exec(select(MealAssignment).where(MealAssignment.special != None)).all()  # noqa: E711
    assert len(rows) == 2


def info(recipe_id: int, protein: Protein) -> MealInfo:
    return MealInfo(
        recipe_id=recipe_id, name=f"R{recipe_id}", protein=protein, meal_type=MealType.both
    )


def test_suggest_fills_skips_occupied_indices() -> None:
    catalogue = [info(n, list(Protein)[n % 9]) for n in range(1, 20)]
    meals: list[MealInfo | None] = [None] * 14
    chosen = suggest_fills(meals, catalogue, random.Random(1), occupied=frozenset({0, 7, 13}))
    assert set(chosen) == set(range(14)) - {0, 7, 13}
    unmasked = suggest_fills(meals, catalogue, random.Random(1))
    assert set(unmasked) == set(range(14))


def test_candidates_work_for_a_special_slot() -> None:
    catalogue = [info(n, list(Protein)[n % 9]) for n in range(1, 6)]
    meals: list[MealInfo | None] = [None] * 14
    assert len(candidates_for_slot(meals, 0, catalogue)) == 5


# ---- variety ----


def test_special_breaks_a_protein_run_and_does_not_count_as_filled() -> None:
    a, b, c = info(1, Protein.meat), info(2, Protein.meat), info(3, Protein.meat)
    run = analyze_week([a, b, *[None] * 12])
    assert [i.kind for i in run.issues] == ["consecutive_protein"]
    broken = analyze_week([a, None, c, *[None] * 11])  # slot 1 holds a special meal
    assert broken.issues == []
    assert broken.filled_slots == 2


def test_variety_through_the_api_ignores_specials(client: TestClient) -> None:
    meat1 = make(client, "A", protein="meat")
    meat2 = make(client, "B", protein="meat")
    put(client, 0, "lunch", {"recipe_id": meat1})
    put(client, 0, "dinner", {"special": "eating_out"})
    put(client, 1, "lunch", {"recipe_id": meat2})
    variety = client.get(f"/api/weeks/{MONDAY}").json()["variety"]
    assert variety["filled_slots"] == 2
    assert variety["issues"] == []
    # A week with nothing but specials has no score yet.
    only = client.put(f"/api/weeks/{NEXT}/days/0/lunch", json={"special": "free"}).json()
    assert only["variety"]["score"] is None
    assert only["variety"]["filled_slots"] == 0


def test_special_sunday_dinner_gives_no_previous_week_context(client: TestClient) -> None:
    meat1 = make(client, "A", protein="meat")
    meat2 = make(client, "B", protein="meat")
    put(client, 6, "dinner", {"recipe_id": meat1}, week=PREVIOUS)
    put(client, 0, "lunch", {"recipe_id": meat2})
    kinds = [i["kind"] for i in client.get(f"/api/weeks/{MONDAY}").json()["variety"]["issues"]]
    assert "previous_week_protein" in kinds
    put(client, 6, "dinner", {"special": "eating_out"}, week=PREVIOUS)
    kinds = [i["kind"] for i in client.get(f"/api/weeks/{MONDAY}").json()["variety"]["issues"]]
    assert "previous_week_protein" not in kinds


# ---- shopping and recipe usage ----


def test_shopping_list_ignores_specials_and_notes(client: TestClient) -> None:
    recipe = make(client, "Soup")
    put(client, 0, "lunch", {"recipe_id": recipe, "note": "buy bread"})
    put(client, 0, "dinner", {"special": "eating_out", "note": "tomatoes"})
    data = client.get(f"/api/weeks/{MONDAY}/shopping-list").json()
    assert [item["name"] for item in data["items"]] == ["Soup ingredient"]
    assert [m["slot"] for m in data["items"][0]["meals"]] == ["lunch"]
    assert "tomatoes" not in str(data)


def test_deleting_a_recipe_keeps_special_slots(client: TestClient) -> None:
    recipe = make(client, "Soup")
    put(client, 0, "lunch", {"recipe_id": recipe})
    put(client, 0, "dinner", {"special": "free", "note": "x"})
    assert client.delete(f"/api/recipes/{recipe}").status_code == 204
    day = day_of(client.get(f"/api/weeks/{MONDAY}").json(), 0)
    assert day["lunch"] is None
    assert day["dinner_special"] == "free"
    assert day["dinner_note"] == "x"
    assert client.get(f"/api/recipes/{recipe}/usage").status_code == 404
