import pytest

from cociboard.domain import IssueKind, IssueSeverity, MealType, Protein
from cociboard.schemas import VarietyReport
from cociboard.variety import (
    BASE_SCORE,
    FISH_CHECK_FROM,
    INFO_PENALTY,
    MAX_MEALS_PER_PROTEIN,
    VEGETARIAN_CHECK_FROM,
    WARNING_PENALTY,
    MealInfo,
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
