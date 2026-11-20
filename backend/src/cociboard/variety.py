"""Pure variety analysis of a week plan. No I/O, no framework imports besides schemas.

The input is the ordered list of the week's 14 meals (Monday lunch, Monday dinner,
Tuesday lunch, ...), with ``None`` for empty slots.

Rules (thresholds are the :class:`VarietyTargets`, the household's preferences; the
defaults are the module constants below):

* ``repeated_recipe``: a recipe used more than once. ``warning``, or ``info`` when the
  recipe is tagged ``batch_cooking`` (leftovers are fine).
* ``consecutive_protein``: the same main protein in consecutive meals (lunch -> dinner and
  dinner -> next day's lunch). One ``warning`` per run. Protein ``none`` is ignored, and so
  are consecutive servings of the same recipe (already reported as a repeat).
* ``protein_overload``: one protein in more than ``max_meals_per_protein`` meals. ``warning``.
* ``few_vegetarian``: fewer than ``min_vegetarian_meals`` vegetable-forward meals once at
  least ``VEGETARIAN_CHECK_FROM`` slots are filled. ``info``. A meal is vegetable-forward
  when it is tagged vegetarian or vegan, or has main protein ``none``.
* ``little_fish``: fewer than ``min_fish_meals`` fish or seafood meals once at least
  ``FISH_CHECK_FROM`` slots are filled. ``info``.
* ``previous_week_protein``: Monday lunch has the same main protein (not ``none``) as the
  previous week's Sunday dinner, and is not the same recipe. ``warning``; only available
  when a :class:`WeekContext` is given.
* ``recent_repeat``: a recipe of this week was also planned 1 or 2 weeks ago (one issue per
  recipe, batch cooking skipped). ``info`` and **score-neutral**: a hint, not a fault.

A minimum of 0 (``few_vegetarian``, ``little_fish``) switches that check off.

Every issue carries an English ``message`` and the ``params`` it was built from, so clients
can render their own language:

* ``repeated_recipe``: ``recipe`` (name), ``count``; ``info`` severity means batch cooking.
* ``consecutive_protein``: ``protein`` (enum value), ``count``, ``from`` and ``to`` (slot
  positions ``{day, slot}``).
* ``protein_overload``: ``protein``, ``count``, ``max``.
* ``few_vegetarian`` and ``little_fish``: ``count``, ``min``.
* ``previous_week_protein``: ``protein``, ``recipe`` (name of last Sunday's dinner).
* ``recent_repeat``: ``recipe`` (name), ``weeks_ago`` (1 or 2).

Score (0-100), ``None`` while no slot is filled::

    score = 90 - 15 * warnings - 5 * infos + min(10, 2 * (distinct_proteins - 1))

The base of 90 leaves room for the bonus: 100 needs six or more distinct proteins and no issues.
``distinct_proteins`` ignores protein ``none``; the bonus is zero below two. The result is
clamped to 0-100. ``recent_repeat`` issues are not counted.
"""

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from cociboard.domain import (
    IssueKind,
    IssueSeverity,
    MealSlot,
    MealType,
    Protein,
    RecipeProperty,
)
from cociboard.schemas import SlotPosition, VarietyIssue, VarietyReport

SLOTS_PER_WEEK = 14
SLOT_ORDER = (MealSlot.lunch, MealSlot.dinner)

MAX_MEALS_PER_PROTEIN = 4
MIN_VEGETARIAN_MEALS = 2
VEGETARIAN_CHECK_FROM = 7
MIN_FISH_MEALS = 2
FISH_CHECK_FROM = 10

BASE_SCORE = 90
WARNING_PENALTY = 15
INFO_PENALTY = 5
PROTEIN_BONUS = 2
MAX_PROTEIN_BONUS = 10

FISH_PROTEINS = frozenset({Protein.fish, Protein.seafood})
_DAY_ABBREVIATIONS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


@dataclass(frozen=True)
class VarietyTargets:
    """The adjustable thresholds of the analysis; a minimum of 0 turns that check off."""

    max_meals_per_protein: int = MAX_MEALS_PER_PROTEIN
    min_vegetarian_meals: int = MIN_VEGETARIAN_MEALS
    min_fish_meals: int = MIN_FISH_MEALS


DEFAULT_TARGETS = VarietyTargets()


@dataclass(frozen=True)
class MealInfo:
    """What the analysis needs to know about one planned (or candidate) recipe."""

    recipe_id: int
    name: str
    protein: Protein
    properties: frozenset[str] = field(default_factory=frozenset)
    meal_type: MealType = MealType.both

    @property
    def is_batch_cooking(self) -> bool:
        return RecipeProperty.batch_cooking.value in self.properties

    @property
    def is_vegetable_forward(self) -> bool:
        return (
            self.protein is Protein.none
            or RecipeProperty.vegetarian.value in self.properties
            or RecipeProperty.vegan.value in self.properties
        )


Week = Sequence[MealInfo | None]


@dataclass(frozen=True)
class WeekContext:
    """What the neighbouring weeks contribute to the analysis of a week.

    ``previous_dinner`` is the previous week's Sunday dinner. ``recent`` maps a recipe id to
    how many weeks ago it was planned (1 or 2, the nearest wins).
    """

    previous_dinner: MealInfo | None = None
    recent: Mapping[int, int] = field(default_factory=dict)


EMPTY_CONTEXT = WeekContext()


def recent_weeks_ago(meal: MealInfo, context: WeekContext) -> int | None:
    """Weeks ago a recipe was planned, or ``None`` when it is not a recent repeat.

    Batch-cooking recipes never count as recent repeats (leftovers and re-cooks are fine).
    """
    if meal.is_batch_cooking:
        return None
    return context.recent.get(meal.recipe_id)


def slot_position(index: int) -> SlotPosition:
    """The grid position of list index 0-13."""
    return SlotPosition(day=index // 2, slot=SLOT_ORDER[index % 2])


def slot_index(day: int, slot: MealSlot) -> int:
    """The list index 0-13 of a grid position."""
    return day * 2 + SLOT_ORDER.index(slot)


def _label(protein: Protein) -> str:
    return protein.value.capitalize()


def _plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def _repeated(meals: Week) -> list[VarietyIssue]:
    positions: dict[int, list[int]] = {}
    for index, meal in enumerate(meals):
        if meal is not None:
            positions.setdefault(meal.recipe_id, []).append(index)
    issues = []
    for indices in positions.values():
        if len(indices) < 2:
            continue
        meal = meals[indices[0]]
        assert meal is not None
        batch = meal.is_batch_cooking
        tail = " (batch cooking, so leftovers are fine)." if batch else " this week."
        issues.append(
            VarietyIssue(
                kind=IssueKind.repeated_recipe,
                severity=IssueSeverity.info if batch else IssueSeverity.warning,
                message=f"{meal.name} is planned {len(indices)} times{tail}",
                slots=[slot_position(i) for i in indices],
                params={"recipe": meal.name, "count": len(indices)},
            )
        )
    return issues


def _same_protein_new_recipe(a: MealInfo | None, b: MealInfo | None) -> bool:
    return (
        a is not None
        and b is not None
        and a.protein is b.protein
        and a.protein is not Protein.none
        and a.recipe_id != b.recipe_id
    )


def _describe_range(start: int, end: int) -> str:
    first, last = slot_position(start), slot_position(end)
    return (
        f"{_DAY_ABBREVIATIONS[first.day]} {first.slot.value} to "
        f"{_DAY_ABBREVIATIONS[last.day]} {last.slot.value}"
    )


def _consecutive(meals: Week) -> list[VarietyIssue]:
    issues = []
    start = 0
    while start < len(meals) - 1:
        end = start
        while end + 1 < len(meals) and _same_protein_new_recipe(meals[end], meals[end + 1]):
            end += 1
        first = meals[start]
        if end > start and first is not None:
            issues.append(
                VarietyIssue(
                    kind=IssueKind.consecutive_protein,
                    severity=IssueSeverity.warning,
                    message=(
                        f"{_label(first.protein)} in {end - start + 1} consecutive meals "
                        f"({_describe_range(start, end)})."
                    ),
                    slots=[slot_position(i) for i in range(start, end + 1)],
                    params={
                        "protein": first.protein.value,
                        "count": end - start + 1,
                        "from": slot_position(start),
                        "to": slot_position(end),
                    },
                )
            )
        start = end + 1
    return issues


def _previous_week_protein(meals: Week, context: WeekContext) -> list[VarietyIssue]:
    previous, monday_lunch = context.previous_dinner, meals[0]
    if previous is None or monday_lunch is None:
        return []
    if not _same_protein_new_recipe(previous, monday_lunch):
        return []
    return [
        VarietyIssue(
            kind=IssueKind.previous_week_protein,
            severity=IssueSeverity.warning,
            message=(
                f"{_label(monday_lunch.protein)} again: last week's Sunday dinner "
                f"({previous.name}) had the same main protein."
            ),
            slots=[slot_position(0)],
            params={"protein": monday_lunch.protein.value, "recipe": previous.name},
        )
    ]


def _recent_repeats(meals: Week, context: WeekContext) -> list[VarietyIssue]:
    positions: dict[int, list[int]] = {}
    for index, meal in enumerate(meals):
        if meal is not None:
            positions.setdefault(meal.recipe_id, []).append(index)
    issues = []
    for indices in positions.values():
        meal = meals[indices[0]]
        assert meal is not None
        weeks_ago = recent_weeks_ago(meal, context)
        if weeks_ago is None:
            continue
        when = "last week" if weeks_ago == 1 else f"{weeks_ago} weeks ago"
        issues.append(
            VarietyIssue(
                kind=IssueKind.recent_repeat,
                severity=IssueSeverity.info,
                message=f"{meal.name} was also planned {when}.",
                slots=[slot_position(i) for i in indices],
                params={"recipe": meal.name, "weeks_ago": weeks_ago},
            )
        )
    return issues


def protein_counts(meals: Week) -> dict[Protein, int]:
    """Meals per main protein, in enum order, leaving out proteins that are not used."""
    counted = Counter(meal.protein for meal in meals if meal is not None)
    return {protein: counted[protein] for protein in Protein if counted[protein] > 0}


def _overload(
    meals: Week, counts: dict[Protein, int], targets: VarietyTargets
) -> list[VarietyIssue]:
    limit = targets.max_meals_per_protein
    issues = []
    for protein, count in counts.items():
        if protein is Protein.none or count <= limit:
            continue
        slots = [
            slot_position(i)
            for i, meal in enumerate(meals)
            if meal is not None and meal.protein is protein
        ]
        issues.append(
            VarietyIssue(
                kind=IssueKind.protein_overload,
                severity=IssueSeverity.warning,
                message=(
                    f"{_label(protein)} is the main protein in {count} meals (more than {limit})."
                ),
                slots=slots,
                params={
                    "protein": protein.value,
                    "count": count,
                    "max": limit,
                },
            )
        )
    return issues


def _coverage(
    meals: Week, filled: int, counts: dict[Protein, int], targets: VarietyTargets
) -> list[VarietyIssue]:
    issues = []
    if filled >= VEGETARIAN_CHECK_FROM:
        veggie = sum(1 for m in meals if m is not None and m.is_vegetable_forward)
        if veggie < targets.min_vegetarian_meals:
            issues.append(
                VarietyIssue(
                    kind=IssueKind.few_vegetarian,
                    severity=IssueSeverity.info,
                    message=(
                        f"Only {_plural(veggie, 'vegetable-forward or vegetarian meal')} "
                        f"so far. Aim for at least {targets.min_vegetarian_meals}."
                    ),
                    slots=[],
                    params={"count": veggie, "min": targets.min_vegetarian_meals},
                )
            )
    if filled >= FISH_CHECK_FROM:
        fish = sum(counts.get(p, 0) for p in FISH_PROTEINS)
        if fish < targets.min_fish_meals:
            issues.append(
                VarietyIssue(
                    kind=IssueKind.little_fish,
                    severity=IssueSeverity.info,
                    message=(
                        f"Only {_plural(fish, 'fish or seafood meal')} so far. "
                        f"Aim for at least {targets.min_fish_meals}."
                    ),
                    slots=[],
                    params={"count": fish, "min": targets.min_fish_meals},
                )
            )
    return issues


def raw_score(issues: Sequence[VarietyIssue], counts: dict[Protein, int]) -> int:
    """The score formula, also defined for an empty plan (used to compare plans)."""
    counted = [i for i in issues if i.kind is not IssueKind.recent_repeat]  # hint only
    warnings = sum(1 for i in counted if i.severity is IssueSeverity.warning)
    infos = len(counted) - warnings
    distinct = sum(1 for protein in counts if protein is not Protein.none)
    bonus = min(MAX_PROTEIN_BONUS, PROTEIN_BONUS * max(0, distinct - 1))
    score = BASE_SCORE - WARNING_PENALTY * warnings - INFO_PENALTY * infos + bonus
    return max(0, min(100, score))


def _first_slot(issue: VarietyIssue) -> int:
    return min((slot_index(s.day, s.slot) for s in issue.slots), default=SLOTS_PER_WEEK)


def analyze_week(
    meals: Week,
    context: WeekContext = EMPTY_CONTEXT,
    targets: VarietyTargets = DEFAULT_TARGETS,
) -> VarietyReport:
    """Analyse a week of exactly 14 meals (``None`` for empty slots).

    ``context`` carries the previous weeks; without it only this week is looked at.
    ``targets`` are the household's thresholds.
    """
    if len(meals) != SLOTS_PER_WEEK:
        raise ValueError(f"expected {SLOTS_PER_WEEK} meals, got {len(meals)}")
    filled = sum(1 for meal in meals if meal is not None)
    counts = protein_counts(meals)
    issues = [
        *_repeated(meals),
        *_consecutive(meals),
        *_overload(meals, counts, targets),
        *_coverage(meals, filled, counts, targets),
        *_previous_week_protein(meals, context),
        *_recent_repeats(meals, context),
    ]
    issues.sort(key=lambda i: (i.severity is not IssueSeverity.warning, _first_slot(i)))
    return VarietyReport(
        score=raw_score(issues, counts) if filled else None,
        filled_slots=filled,
        issues=issues,
        protein_counts=counts,
    )
