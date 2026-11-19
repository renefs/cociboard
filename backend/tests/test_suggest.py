import random
from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

from cociboard.domain import MealSlot, MealType, Protein, fits_slot
from cociboard.seed import seed_if_empty
from cociboard.suggest import candidates_for_slot, suggest_fills, week_score
from cociboard.variety import MealInfo, analyze_week, slot_position

MONDAY = "2026-10-26"


def info(
    recipe_id: int,
    protein: Protein,
    meal_type: MealType = MealType.both,
    *properties: str,
    name: str | None = None,
) -> MealInfo:
    return MealInfo(
        recipe_id=recipe_id,
        name=name or f"R{recipe_id}",
        protein=protein,
        properties=frozenset(properties),
        meal_type=meal_type,
    )


def catalogue() -> list[MealInfo]:
    proteins = list(Protein)
    types = [MealType.lunch, MealType.dinner, MealType.both]
    return [info(n, proteins[n % len(proteins)], types[n % 3]) for n in range(1, 31)]


def test_suggestions_are_deterministic_for_a_seed() -> None:
    meals: list[MealInfo | None] = [None] * 14
    first = suggest_fills(meals, catalogue(), random.Random(7))
    second = suggest_fills(meals, catalogue(), random.Random(7))
    assert first == second
    assert first != suggest_fills(meals, catalogue(), random.Random(8))


def test_catalogue_order_does_not_matter() -> None:
    meals: list[MealInfo | None] = [None] * 14
    forward = suggest_fills(meals, catalogue(), random.Random(3))
    backward = suggest_fills(meals, list(reversed(catalogue())), random.Random(3))
    assert forward == backward


def test_only_empty_slots_are_filled_and_all_fit() -> None:
    keep_a, keep_b = info(100, Protein.meat), info(101, Protein.fish, MealType.dinner)
    meals: list[MealInfo | None] = [None] * 14
    meals[0], meals[5] = keep_a, keep_b
    chosen = suggest_fills(meals, catalogue(), random.Random(1))
    assert set(chosen) == set(range(14)) - {0, 5}
    for index, meal in chosen.items():
        assert fits_slot(meal.meal_type, slot_position(index).slot)


def test_no_repeats_while_unused_recipes_exist() -> None:
    chosen = suggest_fills([None] * 14, catalogue(), random.Random(5))
    ids = [meal.recipe_id for meal in chosen.values()]
    assert len(ids) == len(set(ids)) == 14


def test_avoids_a_repeat_of_a_planned_recipe() -> None:
    planned = info(1, Protein.meat)
    meals: list[MealInfo | None] = [planned] + [None] * 13
    chosen = suggest_fills(meals, [planned, *catalogue()[1:]], random.Random(2))
    assert 1 not in {m.recipe_id for m in chosen.values()}


def test_repeats_only_as_a_last_resort_and_incompatible_slots_stay_empty() -> None:
    only_dinner = [info(1, Protein.meat, MealType.dinner), info(2, Protein.fish, MealType.dinner)]
    chosen = suggest_fills([None] * 14, only_dinner, random.Random(0))
    assert all(slot_position(i).slot is MealSlot.dinner for i in chosen)
    assert set(chosen) == {1, 3, 5, 7, 9, 11, 13}
    assert {m.recipe_id for m in chosen.values()} == {1, 2}  # reused, since only two exist
    assert suggest_fills([None] * 14, [], random.Random(0)) == {}


def test_full_plan_gets_no_suggestions() -> None:
    meals: list[MealInfo | None] = [info(n, Protein.none) for n in range(1, 15)]
    assert suggest_fills(meals, catalogue(), random.Random(0)) == {}


def test_suggested_week_scores_well_with_a_varied_catalogue() -> None:
    chosen = suggest_fills([None] * 14, catalogue(), random.Random(11))
    meals: list[MealInfo | None] = [chosen[i] for i in range(14)]
    report = analyze_week(meals)
    assert not [i for i in report.issues if i.severity.value == "warning"]


def test_candidates_are_ordered_by_variety_with_reasons() -> None:
    meat1, meat2 = info(1, Protein.meat, name="Steak"), info(2, Protein.meat, name="Burger")
    fish = info(3, Protein.fish, name="Hake")
    veggie = info(4, Protein.none, MealType.both, "vegetarian", name="Salad")
    meals: list[MealInfo | None] = [meat1] + [None] * 13
    result = candidates_for_slot(meals, 1, [meat1, meat2, fish, veggie])  # Monday dinner
    by_name = {c.meal.name: c for c in result}
    assert by_name["Burger"].reason == "Meat twice in a row"
    assert by_name["Steak"].reason == "Already planned this week"
    assert by_name["Hake"].reason == "Adds fish or seafood"
    assert by_name["Hake"].score_delta > 0
    assert by_name["Burger"].score_delta < 0
    assert [c.meal.name for c in result][-2:] == ["Burger", "Steak"] or result[-1].score_delta < 0
    deltas = [c.score_delta for c in result]
    assert deltas == sorted(deltas, reverse=True)
    assert result[0].good_pick and not by_name["Burger"].good_pick


def test_candidates_for_a_filled_slot_use_the_slot_as_empty() -> None:
    a, b = info(1, Protein.meat), info(2, Protein.fish)
    meals: list[MealInfo | None] = [a] + [None] * 13
    result = candidates_for_slot(meals, 0, [a, b])
    assert {c.meal.recipe_id for c in result} == {1, 2}
    assert next(c for c in result if c.meal.recipe_id == 1).score_delta == 0


def test_candidates_only_include_compatible_recipes() -> None:
    dinner_only = info(1, Protein.meat, MealType.dinner)
    both = info(2, Protein.fish)
    result = candidates_for_slot([None] * 14, 0, [dinner_only, both])  # a lunch slot
    assert [c.meal.recipe_id for c in result] == [2]


def test_week_score_defined_for_empty_plan() -> None:
    assert week_score([None] * 14) == 90


# ---- API ----


def seeded(client: TestClient, session: Session) -> None:
    seed_if_empty(session)
    assert client.get("/api/recipes").json()


def filled_slots(plan: dict[str, Any]) -> dict[tuple[int, str], int]:
    return {
        (d["day"], slot): d[slot]["id"]
        for d in plan["days"]
        for slot in ("lunch", "dinner")
        if d[slot] is not None
    }


def test_suggest_endpoint_fills_everything_and_respects_fit(
    client: TestClient, session: Session
) -> None:
    seeded(client, session)
    plan = client.post(f"/api/weeks/{MONDAY}/suggest", json={"seed": 4}).json()
    for day in plan["days"]:
        assert day["lunch"]["meal_type"] in ("lunch", "both")
        assert day["dinner"]["meal_type"] in ("dinner", "both")
    assert plan["variety"]["filled_slots"] == 14
    assert plan["variety"]["score"] is not None
    assert not [i for i in plan["variety"]["issues"] if i["severity"] == "warning"]


def test_suggest_endpoint_is_deterministic_and_keeps_filled_slots(
    client: TestClient, session: Session
) -> None:
    seeded(client, session)
    recipes = client.get("/api/recipes", params={"slot": "dinner"}).json()
    keep = recipes[0]["id"]
    client.put(f"/api/weeks/{MONDAY}/days/2/dinner", json={"recipe_id": keep})
    other = "2026-12-14"  # far from MONDAY: neighbouring weeks would change the context
    client.put(f"/api/weeks/{other}/days/2/dinner", json={"recipe_id": keep})

    first = client.post(f"/api/weeks/{MONDAY}/suggest", json={"seed": 9}).json()
    second = client.post(f"/api/weeks/{other}/suggest", json={"seed": 9}).json()
    assert first["days"][2]["dinner"]["id"] == keep
    assert [d["lunch"]["id"] for d in first["days"]] == [d["lunch"]["id"] for d in second["days"]]
    assert filled_slots(first)[(2, "dinner")] == keep
    # a second call with everything filled changes nothing
    again = client.post(f"/api/weeks/{MONDAY}/suggest").json()
    assert filled_slots(again) == filled_slots(first)


def test_suggest_without_body_and_validation(client: TestClient, session: Session) -> None:
    seeded(client, session)
    assert client.post(f"/api/weeks/{MONDAY}/suggest").status_code == 200
    assert client.post("/api/weeks/2026-10-27/suggest").status_code == 422


def test_suggest_with_empty_catalogue_changes_nothing(client: TestClient) -> None:
    plan = client.post(f"/api/weeks/{MONDAY}/suggest", json={"seed": 1}).json()
    assert filled_slots(plan) == {}


def test_candidates_endpoint(client: TestClient, session: Session) -> None:
    seeded(client, session)
    response = client.get(f"/api/weeks/{MONDAY}/days/0/lunch/candidates")
    assert response.status_code == 200
    candidates = response.json()
    assert candidates
    assert all(c["recipe"]["meal_type"] in ("lunch", "both") for c in candidates)
    deltas = [c["score_delta"] for c in candidates]
    assert deltas == sorted(deltas, reverse=True)
    assert all(c["reason"] and c["reason_code"] for c in candidates)
    assert all(isinstance(c["reason_params"], dict) for c in candidates)
    assert any(c["good_pick"] for c in candidates)

    dinner = client.get(f"/api/weeks/{MONDAY}/days/0/dinner/candidates").json()
    assert all(c["recipe"]["meal_type"] in ("dinner", "both") for c in dinner)


def test_candidates_reflect_the_plan(client: TestClient, session: Session) -> None:
    seeded(client, session)
    fish = next(r for r in client.get("/api/recipes").json() if r["protein"] == "fish")
    slot = "lunch" if fish["meal_type"] != "dinner" else "dinner"
    client.put(f"/api/weeks/{MONDAY}/days/0/{slot}", json={"recipe_id": fish["id"]})
    candidates = client.get(f"/api/weeks/{MONDAY}/days/1/lunch/candidates").json()
    same = next((c for c in candidates if c["recipe"]["id"] == fish["id"]), None)
    if same is not None:
        assert same["score_delta"] < 0 and same["reason_code"] == "already_planned"


def test_candidates_validation(client: TestClient) -> None:
    assert client.get("/api/weeks/2026-10-27/days/0/lunch/candidates").status_code == 422
    assert client.get(f"/api/weeks/{MONDAY}/days/7/lunch/candidates").status_code == 422
    assert client.get(f"/api/weeks/{MONDAY}/days/0/brunch/candidates").status_code == 422


def test_every_reason_code_and_params() -> None:
    from cociboard.domain import CandidateReason as R

    def reasons(
        meals: list[MealInfo | None], index: int, cat: list[MealInfo]
    ) -> dict[str, tuple[R, dict[str, str | int], str]]:
        return {
            c.meal.name: (c.reason_code, c.reason_params, c.reason)
            for c in candidates_for_slot(meals, index, cat)
        }

    meat1, meat2 = info(1, Protein.meat, name="Steak"), info(2, Protein.meat, name="Burger")
    fish = info(3, Protein.fish, name="Hake")
    veggie = info(4, Protein.none, MealType.both, "vegetarian", name="Salad")
    plain = info(5, Protein.poultry, MealType.both, name="Chicken")
    result = reasons([meat1] + [None] * 13, 1, [meat1, meat2, fish, veggie])
    assert result["Burger"] == (R.twice_in_a_row, {"protein": "meat"}, "Meat twice in a row")
    assert result["Steak"][0] is R.already_planned
    assert result["Hake"] == (R.adds_fish, {}, "Adds fish or seafood")
    assert result["Salad"][0] is R.adds_vegetable_forward

    # new_protein and the fits_week fallback (protein already present, veggie/fish quota met)
    quota: list[MealInfo | None] = [
        info(10, Protein.fish, name="F1"),
        None,
        info(11, Protein.seafood, name="F2"),
        None,
        info(12, Protein.none, name="V1"),
        None,
        info(13, Protein.none, name="V2"),
    ] + [None] * 7
    out = reasons(
        quota, 8, [plain, info(14, Protein.fish, name="F3"), info(15, Protein.none, name="V3")]
    )
    assert out["Chicken"][0] is R.new_protein
    assert out["F3"][0] is R.fits_week

    # protein_overload and already_planned_batch
    meals: list[MealInfo | None] = [info(20 + n, Protein.meat, name=f"M{n}") for n in range(4)]
    spread: list[MealInfo | None] = [None] * 14
    for n, m in enumerate(meals):
        spread[n * 2 + 1] = m
    cand = info(30, Protein.meat, name="Overload")
    assert reasons(spread, 10, [cand])["Overload"] == (
        R.protein_overload,
        {"protein": "meat"},
        "Too much meat this week",
    )
    stew = info(31, Protein.legumes, MealType.both, "batch_cooking", name="Stew")
    batch = reasons([stew] + [None] * 13, 4, [stew])
    assert batch["Stew"][0] is R.already_planned_batch
