# ADR-0007: Variety rules, scoring and the suggestion algorithm

## Status
Accepted

**Update (v0.12.0):** analysis and suggestions also receive a `WeekContext` with the two
previous weeks; see [ADR-0015](0015-planning-across-weeks.md).

## Context
The product goal is varied weekly menus. v0.4.0 needs to tell the user what is repetitive
(warnings on slots, a score), to fill empty slots automatically ("Suggest"), and to rank the
recipes offered for a slot by how much they help. The rules must be pure and unit-tested
(CLAUDE.md), and the UI must update in one round trip.

## Decision

### Analysis (`variety.py`)
A pure function `analyze_week(meals)` takes the 14 meals in reading order (Monday lunch,
Monday dinner, Tuesday lunch, ...; `None` for empty) as `MealInfo` values (recipe id, name,
protein, properties, meal type) and returns a `VarietyReport`: `score`, `filled_slots`,
`issues` and `protein_counts`. An issue has a `kind`, a `severity` (`info` or `warning`), a
message and the slots it involves. Thresholds are module constants.

| Kind | Rule | Severity |
| --- | --- | --- |
| `repeated_recipe` | recipe planned more than once | warning; info if tagged `batch_cooking` (leftovers are fine) |
| `consecutive_protein` | same main protein in consecutive meals (lunch to dinner and dinner to next day's lunch); one issue per run; protein `none` ignored; two servings of the same recipe are left to the repeat rule | warning |
| `protein_overload` | one protein in more than 4 meals (`none` ignored) | warning |
| `few_vegetarian` | fewer than 2 vegetable-forward meals once at least 7 slots are filled; vegetable-forward means tagged vegetarian or vegan, or protein `none` | info |
| `little_fish` | fewer than 2 fish or seafood meals once at least 10 slots are filled | info |

Plan-wide infos have no slots, so they are listed in the panel but mark nothing in the
grid. Only warnings get the warning marker on slots; infos are tips.

**Score** (0-100, `null` while no slot is filled, shown as "not enough data"):

    score = 90 - 15 * warnings - 5 * infos + min(10, 2 * (distinct_proteins - 1)), clamped to 0..100

`distinct_proteins` ignores `none`; the bonus is 0 below two proteins. The base is 90 and
not 100 so that the bonus is never swallowed by the clamp: a perfect 100 needs no issues
and six or more distinct proteins, which rewards varied weeks instead of merely
inoffensive ones. The UI colours the badge by score: 80 and above green, 60 to 79 amber,
below 60 red. A single warning therefore never makes a week "red".

### Where the report lives
`variety` is part of **every** `WeekPlanRead` response, and also available as
`GET /api/weeks/{week_start}/variety`. Embedding costs one extra pure computation on 14
meals and lets the client replace its cache after any mutation and see grid and score in
one round trip. During an optimistic update (before the response) the grid changes at once
and the variety badge keeps its previous value until the refetch lands; the rules are not
duplicated in the frontend. The separate endpoint is for clients that only need the report.

### Suggestions (`suggest.py`)
`suggest_fills(meals, catalogue, rng)` is greedy and slot by slot in reading order, over
**empty slots only**:

1. candidates = recipes that `fits_slot` for the slot and are not yet in the plan; if every
   compatible recipe is already used, all compatible recipes (a repeat is then unavoidable);
2. compute the week's score with each candidate in place and keep those with the best
   score;
3. pick one of the best with the injected `random.Random` (ties broken randomly).

The catalogue is sorted by id first, so a given seed gives the same result whatever the
database order. `POST /api/weeks/{week_start}/suggest` takes an optional `{ "seed": n }`
(no seed means a random one), applies the result and returns the plan. Slots without any
compatible recipe stay empty. Greedy is not globally optimal but is predictable, instant and
good enough: a seeded fill of the seed catalogue scores 100 with no warnings.

`candidates_for_slot` ranks the recipes that fit one slot (`GET .../days/{day}/{slot}/candidates`).
The baseline is the week with that slot emptied, so the same call serves empty and filled
slots ("Replace"). Each candidate has `score_delta` (score with it minus the baseline),
a short `reason` (first matching of: the warning it would cause, such as "Fish twice in a
row" or "Already planned this week"; "Adds fish or seafood"; "Adds a vegetable-forward meal";
"New protein this week"; otherwise "Fits the week") and `good_pick`, true for at most the
first three candidates that cause no warning and reach the top delta. Order: delta
descending, then recipes with a positive reason, then name (stable, so the list does not
jump around).

### Week management
- `DELETE /api/weeks/{week_start}` clears the week.
- `PUT /api/weeks/{week_start}` (not in the original plan) replaces the whole week from a
  list of `{day, slot, recipe_id}` atomically. It exists so **Undo** of Suggest and Clear
  restores the previous plan in one validated request instead of up to 14 calls that could
  half-fail.
- The frontend keeps the previous plan from the query cache and offers Undo in a toast.

### Frontend
- The week lives in `?week=YYYY-MM-DD` using the plain history API (`pushState`, a
  `popstate` listener); no router library, because there is exactly one view. The current
  week has no parameter; invalid or mid-week dates are normalised in place. The previous
  and next weeks are prefetched through TanStack Query.
- Recipe usage counts ("×2 this week") are derived from the plan. "Best for variety" in the
  recipe panel is a slot-less heuristic (not yet planned first, then least used protein);
  the exact per-slot ranking is the candidates endpoint, used by the picker.
- Long recipe names: `overflow-wrap: normal`, `hyphens: auto`, `lang="es"` on names (the seed
  catalogue is Spanish) and a three-line clamp with the full name in `title`; in the
  seven-column layout the remove button gets its own strip so names use the full column.

## Consequences
- Rules are easy to tune (constants) and are covered by unit tests, including
  determinism and "never overwrites, never violates fits_slot" for suggestions.
- The score is a heuristic. Thresholds are opinionated (for example `none` counts as
  vegetable-forward) and may become user-configurable later.
- Recipes in a non-Spanish language would hyphenate with Spanish rules; a per-recipe
  language is a later option.
- Greedy suggestions can leave a late slot with weaker choices; the user can re-run Suggest
  after Undo (a fresh random seed gives a different result).
