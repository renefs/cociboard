"""Planning across weeks: the week context in variety/suggest, and copying a week."""

import random
from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

from cociboard.domain import CandidateReason, IssueKind, IssueSeverity, MealType, Protein
from cociboard.suggest import candidates_for_slot, reason_text, suggest_fills
from cociboard.variety import MealInfo, WeekContext, analyze_week, raw_score

MONDAY = "2026-10-26"
PREVIOUS = "2026-10-19"
TWO_BACK = "2026-10-12"
NEXT = "2026-11-02"


def meal(
    recipe_id: int, protein: Protein = Protein.none, *properties: str, name: str | None = None
) -> MealInfo:
    return MealInfo(
        recipe_id=recipe_id,
        name=name or f"R{recipe_id}",
        protein=protein,
        properties=frozenset(properties),
        meal_type=MealType.both,
    )


def week(*meals: MealInfo | None) -> list[MealInfo | None]:
    return [*meals, *([None] * (14 - len(meals)))]


def kinds(meals: list[MealInfo | None], context: WeekContext | None = None) -> list[IssueKind]:
    report = analyze_week(meals) if context is None else analyze_week(meals, context)
    return [issue.kind for issue in report.issues]


# ---- previous_week_protein ----


def test_boundary_warning_when_monday_lunch_repeats_sunday_dinner_protein() -> None:
    context = WeekContext(previous_dinner=meal(50, Protein.poultry, name="Roast chicken"))
    report = analyze_week(week(meal(1, Protein.poultry)), context)
    [issue] = report.issues
    assert issue.kind is IssueKind.previous_week_protein
    assert issue.severity is IssueSeverity.warning
    assert [(s.day, s.slot.value) for s in issue.slots] == [(0, "lunch")]
    assert issue.params == {"protein": "poultry", "recipe": "Roast chicken"}
    baseline = analyze_week(week(meal(1, Protein.poultry))).score
    assert report.score is not None and baseline is not None
    assert report.score < baseline


def test_boundary_warning_not_raised_for_other_protein_none_or_same_recipe() -> None:
    context = WeekContext(previous_dinner=meal(50, Protein.poultry))
    assert kinds(week(meal(1, Protein.fish)), context) == []
    assert kinds(week(None, meal(1, Protein.poultry)), context) == []  # Monday dinner
    assert kinds(week(meal(50, Protein.poultry)), context) == []  # same recipe
    none_context = WeekContext(previous_dinner=meal(50, Protein.none))
    assert kinds(week(meal(1, Protein.none)), none_context) == []
    assert kinds(week(None, None), WeekContext()) == []


def test_without_context_nothing_changes() -> None:
    meals = week(meal(1, Protein.poultry), meal(2, Protein.fish))
    assert analyze_week(meals) == analyze_week(meals, WeekContext())


# ---- recent_repeat ----


def test_recent_repeat_is_an_info_per_recipe_with_all_its_slots() -> None:
    context = WeekContext(recent={1: 1, 2: 2})
    report = analyze_week(week(meal(1), meal(2), meal(1, name="R1")), context)
    repeats = [i for i in report.issues if i.kind is IssueKind.recent_repeat]
    assert {i.params["recipe"]: i.params["weeks_ago"] for i in repeats} == {"R1": 1, "R2": 2}
    assert all(i.severity is IssueSeverity.info for i in repeats)
    first = next(i for i in repeats if i.params["recipe"] == "R1")
    assert [(s.day, s.slot.value) for s in first.slots] == [(0, "lunch"), (1, "lunch")]


def test_recent_repeat_skips_batch_cooking_and_unknown_recipes() -> None:
    context = WeekContext(recent={1: 1})
    assert kinds(week(meal(1, Protein.none, "batch_cooking")), context) == []
    assert kinds(week(meal(2)), context) == []


def test_recent_repeat_does_not_change_the_score() -> None:
    meals = week(meal(1, Protein.fish), meal(2, Protein.poultry))
    plain = analyze_week(meals)
    with_recent = analyze_week(meals, WeekContext(recent={1: 1, 2: 2}))
    assert IssueKind.recent_repeat in kinds(meals, WeekContext(recent={1: 1}))
    assert with_recent.score == plain.score
    assert raw_score(with_recent.issues, with_recent.protein_counts) == raw_score(
        plain.issues, plain.protein_counts
    )


# ---- suggestions ----


def test_suggest_prefers_recipes_not_planned_recently() -> None:
    catalogue = [meal(n, Protein.none) for n in range(1, 31)]
    context = WeekContext(recent=dict.fromkeys(range(1, 15), 1))
    chosen = suggest_fills(week(), catalogue, random.Random(3), context)
    assert len(chosen) == 14
    assert all(m.recipe_id > 14 for m in chosen.values())


def test_suggest_falls_back_to_recent_then_to_repeats() -> None:
    catalogue = [meal(n, Protein.none) for n in range(1, 11)]
    context = WeekContext(recent=dict.fromkeys(range(1, 11), 2))  # everything is recent
    chosen = suggest_fills(week(), catalogue, random.Random(1), context)
    ids = [m.recipe_id for m in chosen.values()]
    assert len(ids) == 14
    assert len(set(ids[:10])) == 10  # still no repeat inside the week while unused ones exist


def test_suggest_without_context_is_unchanged() -> None:
    catalogue = [meal(n, Protein.none) for n in range(1, 31)]
    assert suggest_fills(week(), catalogue, random.Random(4)) == suggest_fills(
        week(), catalogue, random.Random(4), WeekContext()
    )


def test_suggest_avoids_the_monday_boundary_warning() -> None:
    catalogue = [meal(1, Protein.poultry), meal(2, Protein.fish), meal(3, Protein.meat)]
    context = WeekContext(previous_dinner=meal(50, Protein.poultry))
    for seed in range(10):
        chosen = suggest_fills(week(), catalogue, random.Random(seed), context)
        assert chosen[0].protein is not Protein.poultry


# ---- candidates ----


def test_recent_candidate_gets_reason_sorts_after_and_is_never_a_good_pick() -> None:
    a, b, c = meal(1, Protein.fish, name="Hake"), meal(2, Protein.fish, name="Cod"), meal(3)
    context = WeekContext(recent={1: 1, 3: 2})
    result = candidates_for_slot(week(), 0, [a, b, c], context)
    by_id = {x.meal.recipe_id: x for x in result}
    assert by_id[1].reason_code is CandidateReason.planned_recently
    assert by_id[1].reason_params == {"weeks_ago": 1}
    assert by_id[1].reason == "Planned last week"
    assert by_id[3].reason_params == {"weeks_ago": 2}
    assert reason_text(CandidateReason.planned_recently, {"weeks_ago": 2}) == "Planned 2 weeks ago"
    assert not by_id[1].good_pick and not by_id[3].good_pick
    assert by_id[2].reason_code is CandidateReason.adds_fish and by_id[2].good_pick
    assert by_id[1].score_delta == by_id[2].score_delta
    assert [x.meal.recipe_id for x in result].index(2) < [x.meal.recipe_id for x in result].index(1)


def test_warning_reason_wins_over_recently_planned() -> None:
    chicken = meal(1, Protein.poultry, name="Chicken")
    context = WeekContext(previous_dinner=meal(50, Protein.poultry), recent={1: 1})
    [candidate] = candidates_for_slot(week(), 0, [chicken], context)
    assert candidate.reason_code is CandidateReason.twice_in_a_row
    assert candidate.score_delta < 0 and not candidate.good_pick


def test_batch_recipes_are_not_marked_recent() -> None:
    stew = meal(1, Protein.meat, "batch_cooking", name="Stew")
    [candidate] = candidates_for_slot(week(), 0, [stew], WeekContext(recent={1: 1}))
    assert candidate.reason_code is not CandidateReason.planned_recently
    assert candidate.good_pick


# ---- API helpers ----


def make(
    client: TestClient, name: str, protein: str = "none", meal_type: str = "both", *tags: str
) -> int:
    response = client.post(
        "/api/recipes",
        json={
            "name": name,
            "meal_type": meal_type,
            "protein": protein,
            "properties": list(tags),
            "ingredients": ["x"],
        },
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def put(client: TestClient, week_start: str, day: int, slot: str, recipe_id: int) -> Any:
    response = client.put(
        f"/api/weeks/{week_start}/days/{day}/{slot}", json={"recipe_id": recipe_id}
    )
    assert response.status_code == 200, response.text
    return response.json()


def issue_kinds(plan: dict[str, Any]) -> list[str]:
    return [i["kind"] for i in plan["variety"]["issues"]]


def filled(plan: dict[str, Any]) -> dict[tuple[int, str], str]:
    return {
        (d["day"], s): d[s]["name"]
        for d in plan["days"]
        for s in ("lunch", "dinner")
        if d[s] is not None
    }


# ---- API: variety, suggest, candidates use the previous weeks ----


def test_week_variety_flags_the_boundary_and_recent_repeats(client: TestClient) -> None:
    chicken = make(client, "Roast chicken", "poultry")
    curry = make(client, "Chicken curry", "poultry")
    pasta = make(client, "Pasta")
    put(client, PREVIOUS, 6, "dinner", chicken)
    put(client, TWO_BACK, 0, "lunch", pasta)
    put(client, MONDAY, 0, "lunch", curry)
    plan = put(client, MONDAY, 3, "lunch", pasta)
    assert issue_kinds(plan) == ["previous_week_protein", "recent_repeat"]
    boundary, recent = plan["variety"]["issues"]
    assert boundary["params"] == {"protein": "poultry", "recipe": "Roast chicken"}
    assert recent["params"] == {"recipe": "Pasta", "weeks_ago": 2}
    assert client.get(f"/api/weeks/{MONDAY}/variety").json() == plan["variety"]
    # a week without neighbours is untouched, and the week after sees this one
    assert issue_kinds(client.get(f"/api/weeks/{NEXT}").json()) == []
    after = put(client, NEXT, 0, "lunch", pasta)
    assert after["variety"]["issues"][0]["params"] == {"recipe": "Pasta", "weeks_ago": 1}


def test_archived_recipes_still_count_as_recent(client: TestClient) -> None:
    pasta = make(client, "Pasta")
    put(client, PREVIOUS, 0, "lunch", pasta)
    plan = put(client, MONDAY, 0, "lunch", pasta)
    assert issue_kinds(plan) == ["recent_repeat"]
    client.patch(f"/api/recipes/{pasta}", json={"archived": True})
    assert issue_kinds(client.get(f"/api/weeks/{MONDAY}").json()) == ["recent_repeat"]


def test_nearest_week_wins(client: TestClient) -> None:
    pasta = make(client, "Pasta")
    put(client, TWO_BACK, 0, "lunch", pasta)
    put(client, PREVIOUS, 2, "dinner", pasta)
    plan = put(client, MONDAY, 0, "lunch", pasta)
    assert plan["variety"]["issues"][0]["params"]["weeks_ago"] == 1


def test_suggest_avoids_recent_recipes(client: TestClient) -> None:
    old = [make(client, f"Old {n}", "none") for n in range(14)]
    for n, recipe in enumerate(old):
        put(client, PREVIOUS, n // 2, "lunch" if n % 2 == 0 else "dinner", recipe)
    for n in range(14):
        make(client, f"New {n}", "none")
    plan = client.post(f"/api/weeks/{MONDAY}/suggest", json={"seed": 2}).json()
    assert len(filled(plan)) == 14
    assert all(name.startswith("New") for name in filled(plan).values())
    assert "recent_repeat" not in issue_kinds(plan)


def test_candidates_mark_recent_recipes(client: TestClient) -> None:
    pasta = make(client, "Pasta", "none", "lunch")
    soup = make(client, "Soup", "none", "lunch")
    put(client, PREVIOUS, 4, "lunch", pasta)
    result = client.get(f"/api/weeks/{MONDAY}/days/0/lunch/candidates").json()
    by_id = {c["recipe"]["id"]: c for c in result}
    assert by_id[pasta]["reason_code"] == "planned_recently"
    assert by_id[pasta]["reason_params"] == {"weeks_ago": 1}
    assert not by_id[pasta]["good_pick"]
    assert by_id[soup]["reason_code"] != "planned_recently"
    assert result[-1]["recipe"]["id"] == pasta


# ---- API: copy a week ----


def copy(client: TestClient, target: str, source: str) -> Any:
    return client.post(f"/api/weeks/{target}/copy", json={"from_week_start": source})


def test_copy_into_an_empty_week(client: TestClient) -> None:
    a, b = make(client, "A"), make(client, "B", "none", "dinner")
    put(client, PREVIOUS, 0, "lunch", a)
    put(client, PREVIOUS, 6, "dinner", b)
    response = copy(client, MONDAY, PREVIOUS)
    assert response.status_code == 200
    body = response.json()
    assert (body["copied"], body["skipped_archived"], body["source_meals"]) == (2, 0, 2)
    assert filled(body["plan"]) == {(0, "lunch"): "A", (6, "dinner"): "B"}
    assert client.get(f"/api/weeks/{MONDAY}").json() == body["plan"]
    assert filled(client.get(f"/api/weeks/{PREVIOUS}").json()) == filled(body["plan"])


def test_copy_only_fills_empty_slots(client: TestClient) -> None:
    a, b, keep = make(client, "A"), make(client, "B"), make(client, "Keep")
    put(client, PREVIOUS, 0, "lunch", a)
    put(client, PREVIOUS, 1, "lunch", b)
    put(client, MONDAY, 0, "lunch", keep)
    body = copy(client, MONDAY, PREVIOUS).json()
    assert (body["copied"], body["skipped_archived"], body["source_meals"]) == (1, 0, 2)
    assert filled(body["plan"]) == {(0, "lunch"): "Keep", (1, "lunch"): "B"}
    again = copy(client, MONDAY, PREVIOUS).json()
    assert (again["copied"], again["source_meals"]) == (0, 2)  # nothing left to fill


def test_copy_skips_archived_recipes(client: TestClient) -> None:
    a, old = make(client, "A"), make(client, "Old")
    put(client, PREVIOUS, 0, "lunch", a)
    put(client, PREVIOUS, 1, "lunch", old)
    client.patch(f"/api/recipes/{old}", json={"archived": True})
    body = copy(client, MONDAY, PREVIOUS).json()
    assert (body["copied"], body["skipped_archived"]) == (1, 1)
    assert filled(body["plan"]) == {(0, "lunch"): "A"}


def test_copy_from_an_empty_week_copies_nothing(client: TestClient) -> None:
    body = copy(client, MONDAY, PREVIOUS).json()
    assert (body["copied"], body["skipped_archived"], body["source_meals"]) == (0, 0, 0)
    assert filled(body["plan"]) == {}


def test_copy_validation(client: TestClient) -> None:
    assert copy(client, MONDAY, MONDAY).status_code == 422  # same week
    assert copy(client, MONDAY, "2026-10-20").status_code == 422  # source is a Tuesday
    assert copy(client, "2026-10-27", PREVIOUS).status_code == 422  # target is a Tuesday
    assert client.post(f"/api/weeks/{MONDAY}/copy", json={}).status_code == 422
    assert (
        client.post(f"/api/weeks/{MONDAY}/copy", json={"from_week_start": "nope"}).status_code
        == 422
    )


def test_copy_race_returns_409(client: TestClient, session: Session, monkeypatch: Any) -> None:
    from sqlalchemy.exc import IntegrityError

    a = make(client, "A")
    put(client, PREVIOUS, 0, "lunch", a)

    def boom() -> None:
        raise IntegrityError("x", {}, Exception("unique"))

    monkeypatch.setattr(session, "commit", boom)
    assert copy(client, MONDAY, PREVIOUS).status_code == 409
