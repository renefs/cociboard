"""Pure suggestion logic: fill empty slots and rank candidates by their effect on variety.

Both functions work on the same 14-meal list as :mod:`cociboard.variety` and never touch
a filled slot. See ADR-0007 for the algorithm.
"""

import random
from collections.abc import Sequence
from dataclasses import dataclass

from cociboard.domain import (
    CandidateReason,
    IssueKind,
    IssueSeverity,
    MealSlot,
    Protein,
    fits_slot,
)
from cociboard.schemas import VarietyReport
from cociboard.variety import (
    FISH_PROTEINS,
    MIN_FISH_MEALS,
    MIN_VEGETARIAN_MEALS,
    MealInfo,
    Week,
    analyze_week,
    protein_counts,
    raw_score,
    slot_position,
)

GOOD_PICKS = 3

ReasonParams = dict[str, str]
Reason = tuple[CandidateReason, ReasonParams]
FALLBACK_REASON: Reason = (CandidateReason.fits_week, {})


def reason_text(code: CandidateReason, params: ReasonParams) -> str:
    """English wording of a reason. Clients translate from the code and params instead."""
    protein = params.get("protein", "").capitalize()
    texts = {
        CandidateReason.fits_week: "Fits the week",
        CandidateReason.adds_fish: "Adds fish or seafood",
        CandidateReason.adds_vegetable_forward: "Adds a vegetable-forward meal",
        CandidateReason.new_protein: "New protein this week",
        CandidateReason.twice_in_a_row: f"{protein} twice in a row",
        CandidateReason.protein_overload: f"Too much {protein.lower()} this week",
        CandidateReason.already_planned: "Already planned this week",
        CandidateReason.already_planned_batch: "Already planned (batch cooking)",
    }
    return texts[code]


@dataclass(frozen=True)
class Candidate:
    """A recipe that fits a slot, with its effect on the variety score."""

    meal: MealInfo
    score_delta: int
    reason_code: CandidateReason
    reason_params: ReasonParams
    good_pick: bool

    @property
    def reason(self) -> str:
        return reason_text(self.reason_code, self.reason_params)


def week_score(meals: Week) -> int:
    """Comparable variety score; unlike the report's score it is defined for empty plans."""
    report = analyze_week(meals)
    return raw_score(report.issues, report.protein_counts)


def _slot_of(index: int) -> MealSlot:
    return slot_position(index).slot


def _with(meals: Week, index: int, meal: MealInfo | None) -> list[MealInfo | None]:
    updated = list(meals)
    updated[index] = meal
    return updated


def _warning_reason(report: VarietyReport, index: int, meal: MealInfo) -> Reason | None:
    """Reason code for the first warning (or batch note) the placed meal takes part in."""
    here = slot_position(index)
    for issue in report.issues:
        if here not in issue.slots:
            continue
        if issue.kind is IssueKind.consecutive_protein:
            return CandidateReason.twice_in_a_row, {"protein": meal.protein.value}
        if issue.kind is IssueKind.protein_overload:
            return CandidateReason.protein_overload, {"protein": meal.protein.value}
        if issue.kind is IssueKind.repeated_recipe:
            if issue.severity is IssueSeverity.info:
                return CandidateReason.already_planned_batch, {}
            return CandidateReason.already_planned, {}
    return None


def _causes_warning(report: VarietyReport, index: int) -> bool:
    here = slot_position(index)
    return any(
        issue.severity is IssueSeverity.warning and here in issue.slots for issue in report.issues
    )


def _positive_reason(baseline: Week, meal: MealInfo) -> Reason | None:
    counts = protein_counts(baseline)
    if meal.protein in FISH_PROTEINS and sum(counts.get(p, 0) for p in FISH_PROTEINS) < (
        MIN_FISH_MEALS
    ):
        return CandidateReason.adds_fish, {}
    veggie = sum(1 for m in baseline if m is not None and m.is_vegetable_forward)
    if meal.is_vegetable_forward and veggie < MIN_VEGETARIAN_MEALS:
        return CandidateReason.adds_vegetable_forward, {}
    if meal.protein is not Protein.none and counts.get(meal.protein, 0) == 0:
        return CandidateReason.new_protein, {}
    return None


def candidates_for_slot(meals: Week, index: int, catalogue: Sequence[MealInfo]) -> list[Candidate]:
    """Recipes that fit slot ``index``, best variety first.

    The baseline is the week with that slot emptied, so the same call serves empty slots
    and "replace" on filled ones. Ordering: higher score delta, then recipes with a positive
    reason, then name.
    """
    baseline = _with(meals, index, None)
    base_score = week_score(baseline)
    slot = _slot_of(index)
    scored: list[tuple[MealInfo, int, bool, Reason]] = []
    for meal in catalogue:
        if not fits_slot(meal.meal_type, slot):
            continue
        report = analyze_week(_with(baseline, index, meal))
        delta = raw_score(report.issues, report.protein_counts) - base_score
        warning_text = _warning_reason(report, index, meal)
        positive = _positive_reason(baseline, meal)
        reason = warning_text or positive or FALLBACK_REASON
        scored.append((meal, delta, _causes_warning(report, index), reason))
    scored.sort(
        key=lambda item: (-item[1], item[3][0] is CandidateReason.fits_week, item[0].name.lower())
    )
    top = scored[0][1] if scored else 0
    return [
        Candidate(
            meal=meal,
            score_delta=delta,
            reason_code=reason[0],
            reason_params=reason[1],
            good_pick=position < GOOD_PICKS and not warned and delta >= top,
        )
        for position, (meal, delta, warned, reason) in enumerate(scored)
    ]


def suggest_fills(
    meals: Week, catalogue: Sequence[MealInfo], rng: random.Random
) -> dict[int, MealInfo]:
    """Choose a recipe for every empty slot, greedily, in reading order.

    For each empty slot the candidates are the compatible recipes not yet in the plan (all
    compatible recipes if every one is already used). The one giving the best variety score
    wins; ties are broken with ``rng``. Filled slots are never touched. Slots without any
    compatible recipe stay empty. Returns ``{slot index: recipe}`` for the new meals only.
    """
    ordered = sorted(catalogue, key=lambda meal: meal.recipe_id)
    plan = list(meals)
    chosen: dict[int, MealInfo] = {}
    for index, current in enumerate(meals):
        if current is not None:
            continue
        slot = _slot_of(index)
        compatible = [m for m in ordered if fits_slot(m.meal_type, slot)]
        used = {m.recipe_id for m in plan if m is not None}
        pool = [m for m in compatible if m.recipe_id not in used] or compatible
        if not pool:
            continue
        scores = [(week_score(_with(plan, index, meal)), meal) for meal in pool]
        best = max(score for score, _ in scores)
        pick = rng.choice([meal for score, meal in scores if score == best])
        plan[index] = pick
        chosen[index] = pick
    return chosen
