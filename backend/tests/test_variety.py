import pytest

from cociboard.domain import IssueKind, IssueSeverity, MealType, Protein
from cociboard.household import (
    DEFAULT_MAX_MEALS_PER_PROTEIN,
    DEFAULT_MIN_FISH_MEALS,
    DEFAULT_MIN_VEGETARIAN_MEALS,
)
from cociboard.schemas import VarietyReport
from cociboard.variety import (
    BASE_SCORE,
    DEFAULT_TARGETS,
    FISH_CHECK_FROM,
    INFO_PENALTY,
    MAX_MEALS_PER_PROTEIN,
    MIN_FISH_MEALS,
    MIN_VEGETARIAN_MEALS,
    VEGETARIAN_CHECK_FROM,
    WARNING_PENALTY,
    MealInfo,
    VarietyTargets,
    analyze_week,
    slot_index,
    slot_position,
)


def meal(
    recipe_id: int, protein: Protein = Protein.none, *properties: str, name: str | None = None
) -> MealInfo:
    return MealInfo(
        recipe_id=recipe_id,
        name=name or f"Recipe {recipe_id}",
        protein=protein,
        properties=frozenset(properties),
        meal_type=MealType.both,
    )


def week(*meals: MealInfo | None) -> list[MealInfo | None]:
    return [*meals, *([None] * (14 - len(meals)))]


def kinds(report: VarietyReport) -> list[IssueKind]:
    return [issue.kind for issue in report.issues]


def test_empty_plan_has_no_score() -> None:
    report = analyze_week(week())
    assert report.score is None
    assert report.issues == []
    assert report.filled_slots == 0
    assert report.protein_counts == {}


def test_requires_fourteen_meals() -> None:
    with pytest.raises(ValueError, match="14"):
        analyze_week([None] * 13)


def test_slot_index_roundtrip() -> None:
    for index in range(14):
        position = slot_position(index)
        assert slot_index(position.day, position.slot) == index
    assert slot_position(0).slot.value == "lunch"
    assert slot_position(3).day == 1


def test_repeated_recipe_is_a_warning_with_all_slots() -> None:
    report = analyze_week(
        week(meal(1, Protein.meat), None, meal(2, Protein.fish), meal(1, Protein.meat))
    )
    [issue] = report.issues
    assert issue.kind is IssueKind.repeated_recipe
    assert issue.severity is IssueSeverity.warning
    assert [(s.day, s.slot.value) for s in issue.slots] == [(0, "lunch"), (1, "dinner")]
    assert "Recipe 1" in issue.message
    assert report.score == BASE_SCORE - WARNING_PENALTY + 2  # two distinct proteins


def test_repeated_batch_cooking_recipe_is_only_info() -> None:
    stew = meal(1, Protein.legumes, "batch_cooking")
    report = analyze_week(week(stew, None, None, stew))
    [issue] = report.issues
    assert issue.kind is IssueKind.repeated_recipe
    assert issue.severity is IssueSeverity.info
    assert "leftovers" in issue.message
    assert report.score == BASE_SCORE - INFO_PENALTY


def test_same_protein_in_consecutive_meals_across_days() -> None:
    # Monday dinner and Tuesday lunch are consecutive meals.
    report = analyze_week(week(None, meal(1, Protein.fish), meal(2, Protein.fish)))
    [issue] = report.issues
    assert issue.kind is IssueKind.consecutive_protein
    assert issue.severity is IssueSeverity.warning
    assert [(s.day, s.slot.value) for s in issue.slots] == [(0, "dinner"), (1, "lunch")]


def test_a_run_of_three_is_one_issue() -> None:
    report = analyze_week(week(meal(1, Protein.meat), meal(2, Protein.meat), meal(3, Protein.meat)))
    [issue] = report.issues
    assert len(issue.slots) == 3
    assert "3 consecutive" in issue.message


def test_gap_or_different_protein_is_fine_and_none_is_ignored() -> None:
    assert analyze_week(week(meal(1, Protein.meat), None, meal(2, Protein.meat))).issues == []
    assert analyze_week(week(meal(1, Protein.meat), meal(2, Protein.fish))).issues == []
    assert analyze_week(week(meal(1), meal(2))).issues == []  # protein none


def test_consecutive_servings_of_one_recipe_are_reported_only_as_repeat() -> None:
    soup = meal(1, Protein.fish)
    report = analyze_week(week(soup, soup))
    assert kinds(report) == [IssueKind.repeated_recipe]


def test_protein_overload_above_threshold_only() -> None:
    def alternating(count: int) -> list[MealInfo | None]:
        slots: list[MealInfo | None] = [None] * 14
        for n in range(count):
            slots[n * 2] = meal(n + 1, Protein.meat)  # every other slot, never consecutive
        return slots

    assert MAX_MEALS_PER_PROTEIN == 4
    assert analyze_week(alternating(4)).issues == []
    report = analyze_week(alternating(5))
    [issue] = report.issues
    assert issue.kind is IssueKind.protein_overload
    assert len(issue.slots) == 5
    assert report.protein_counts == {Protein.meat: 5}


def test_few_vegetarian_meals_is_info_from_seven_filled_slots() -> None:
    proteins = [Protein.meat, Protein.fish, Protein.poultry, Protein.eggs, Protein.dairy]
    meals: list[MealInfo | None] = [
        meal(i + 1, proteins[i % 5]) for i in range(VEGETARIAN_CHECK_FROM)
    ]
    report = analyze_week(meals + [None] * (14 - VEGETARIAN_CHECK_FROM))
    assert kinds(report) == [IssueKind.few_vegetarian]
    assert report.issues[0].severity is IssueSeverity.info
    assert report.issues[0].slots == []

    below = analyze_week(meals[:6] + [None] * 8)
    assert below.issues == []


def test_vegetarian_vegan_or_no_protein_meals_count_as_vegetable_forward() -> None:
    proteins = [Protein.meat, Protein.fish, Protein.poultry, Protein.eggs, Protein.dairy]
    base: list[MealInfo | None] = [meal(i + 1, proteins[i % 5]) for i in range(5)]
    ok = base + [meal(10, Protein.dairy, "vegetarian"), meal(11, Protein.none)] + [None] * 7
    assert IssueKind.few_vegetarian not in kinds(analyze_week(ok))
    one = base + [meal(10, Protein.tofu, "vegan"), meal(12, Protein.legumes)] + [None] * 7
    assert IssueKind.few_vegetarian in kinds(analyze_week(one))


def test_little_fish_is_info_from_ten_filled_slots() -> None:
    proteins = [Protein.meat, Protein.poultry, Protein.eggs, Protein.dairy, Protein.legumes]
    meals: list[MealInfo | None] = [
        meal(i + 1, proteins[i % 5], "vegetarian") for i in range(FISH_CHECK_FROM)
    ]
    report = analyze_week(meals + [None] * (14 - FISH_CHECK_FROM))
    assert kinds(report) == [IssueKind.little_fish]
    meals[0] = meal(50, Protein.fish, "vegetarian")
    meals[2] = meal(51, Protein.seafood, "vegetarian")  # seafood counts too
    assert analyze_week(meals + [None] * (14 - FISH_CHECK_FROM)).issues == []
    assert analyze_week(meals[:9] + [None] * 5).issues == []


def test_score_formula_and_bonus_cap() -> None:
    # Eight distinct proteins on every other slot: no issues, bonus capped at 10 (clamped to 100).
    proteins = [p for p in Protein if p is not Protein.none]
    meals: list[MealInfo | None] = [None] * 14
    for n, protein in enumerate(proteins):
        meals[n * 2 - (1 if n * 2 >= 14 else 0)] = meal(n + 1, protein, "vegetarian")
    report = analyze_week(meals)
    assert report.score == 100


def test_warnings_sort_before_infos_and_score_never_negative() -> None:
    meals: list[MealInfo | None] = [meal(1, Protein.meat) for _ in range(14)]
    report = analyze_week(meals)
    severities = [issue.severity for issue in report.issues]
    assert severities == sorted(severities, key=lambda s: s is not IssueSeverity.warning)
    assert report.score is not None and 0 <= report.score <= 100


def test_protein_counts_in_enum_order() -> None:
    report = analyze_week(week(meal(1, Protein.fish), None, meal(2, Protein.meat), meal(3)))
    assert list(report.protein_counts.items()) == [
        (Protein.meat, 1),
        (Protein.fish, 1),
        (Protein.none, 1),
    ]


def test_every_issue_kind_carries_its_params() -> None:
    from cociboard.schemas import SlotPosition

    # repeated_recipe (warning) and consecutive_protein via a run of three
    repeat = analyze_week(week(meal(1, Protein.meat, name="Lentejas"), None, None, meal(1)))
    assert repeat.issues[0].params == {"recipe": "Lentejas", "count": 2}

    run = analyze_week(week(meal(1, Protein.fish), meal(2, Protein.fish), meal(3, Protein.fish)))
    assert run.issues[0].params == {
        "protein": "fish",
        "count": 3,
        "from": SlotPosition(day=0, slot="lunch"),
        "to": SlotPosition(day=1, slot="lunch"),
    }

    spread: list[MealInfo | None] = [None] * 14
    for n in range(5):
        spread[n * 2] = meal(n + 1, Protein.meat, "vegetarian")
    overload = analyze_week(spread)
    assert overload.issues[0].params == {"protein": "meat", "count": 5, "max": 4}

    proteins = [Protein.meat, Protein.fish, Protein.poultry, Protein.eggs, Protein.dairy]
    few = analyze_week([meal(i + 1, proteins[i % 5]) for i in range(7)] + [None] * 7)
    assert few.issues[0].kind is IssueKind.few_vegetarian
    assert few.issues[0].params == {"count": 0, "min": 2}

    veg = [Protein.meat, Protein.poultry, Protein.eggs, Protein.dairy, Protein.legumes]
    little = analyze_week([meal(i + 1, veg[i % 5], "vegetarian") for i in range(10)] + [None] * 4)
    assert little.issues[0].kind is IssueKind.little_fish
    assert little.issues[0].params == {"count": 0, "min": 2}


def test_params_are_json_serialisable() -> None:
    report = analyze_week(week(meal(1, Protein.fish), meal(2, Protein.fish)))
    data = report.model_dump(mode="json")
    assert data["issues"][0]["params"]["from"] == {"day": 0, "slot": "lunch"}


def _meat_every_other_slot(count: int) -> list[MealInfo | None]:
    slots: list[MealInfo | None] = [None] * 14
    for n in range(count):
        slots[n * 2] = meal(n + 1, Protein.meat)
    return slots


def test_default_targets_equal_the_module_constants() -> None:
    assert (
        VarietyTargets(MAX_MEALS_PER_PROTEIN, MIN_VEGETARIAN_MEALS, MIN_FISH_MEALS)
        == DEFAULT_TARGETS
    )
    assert (
        DEFAULT_MAX_MEALS_PER_PROTEIN,
        DEFAULT_MIN_VEGETARIAN_MEALS,
        DEFAULT_MIN_FISH_MEALS,
    ) == (
        MAX_MEALS_PER_PROTEIN,
        MIN_VEGETARIAN_MEALS,
        MIN_FISH_MEALS,
    )


def test_a_higher_protein_limit_allows_more_meals_and_a_lower_one_flags_earlier() -> None:
    five = _meat_every_other_slot(5)
    assert analyze_week(five, targets=VarietyTargets(max_meals_per_protein=5)).issues == []
    report = analyze_week(
        _meat_every_other_slot(3), targets=VarietyTargets(max_meals_per_protein=2)
    )
    [issue] = report.issues
    assert issue.kind is IssueKind.protein_overload
    assert issue.params == {"protein": "meat", "count": 3, "max": 2}
    assert "more than 2" in issue.message


def test_minimum_of_zero_switches_the_coverage_checks_off() -> None:
    proteins = [Protein.meat, Protein.poultry, Protein.eggs, Protein.dairy, Protein.legumes]
    meals: list[MealInfo | None] = [meal(i + 1, proteins[i % 5], "x") for i in range(12)]
    meals = meals + [None] * 2
    assert {IssueKind.few_vegetarian, IssueKind.little_fish} <= set(kinds(analyze_week(meals)))
    off = VarietyTargets(min_vegetarian_meals=0, min_fish_meals=0)
    assert analyze_week(meals, targets=off).issues == []
    only_fish_off = analyze_week(meals, targets=VarietyTargets(min_fish_meals=0))
    assert kinds(only_fish_off) == [IssueKind.few_vegetarian]


def test_coverage_params_reflect_the_targets() -> None:
    proteins = [Protein.meat, Protein.poultry, Protein.eggs, Protein.dairy, Protein.legumes]
    meals: list[MealInfo | None] = [meal(i + 1, proteins[i % 5]) for i in range(12)]
    meals = meals + [None] * 2
    report = analyze_week(meals, targets=VarietyTargets(min_vegetarian_meals=5, min_fish_meals=3))
    params = {i.kind: i.params for i in report.issues}
    assert params[IssueKind.few_vegetarian]["min"] == 5
    assert params[IssueKind.little_fish] == {"count": 0, "min": 3}
