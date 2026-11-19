# ADR-0015: Planning across weeks

## Status
Accepted

## Context
Variety analysis and suggestions only looked at one week. A chicken dinner on Sunday followed
by chicken on Monday was not flagged, and Suggest proposed the same recipes week after week.
There was also no quick way to reuse last week's plan.

## Decision

### Context window of two weeks
`analyze_week(meals, context)`, `suggest_fills(..., context)` and `candidates_for_slot(...,
context)` take an optional frozen `WeekContext`: `previous_dinner` (Sunday dinner of the
previous week) and `recent` (recipe id to weeks ago, 1 or 2, the nearest wins). Without a
context everything behaves as in ADR-0007. `planner.week_context` builds it from the stored
plans of the two previous weeks; archived recipes are included, because they were really eaten.

### New rules
| Kind | Rule | Severity |
| --- | --- | --- |
| `previous_week_protein` | Monday lunch has the same main protein (not `none`) as the previous Sunday dinner and is not the same recipe | warning (slot: Monday lunch) |
| `recent_repeat` | a recipe of this week was also planned 1 or 2 weeks ago; one issue per recipe; `batch_cooking` recipes are skipped | info |

`recent_repeat` is **score-neutral**: `raw_score` skips it explicitly. Many households keep
favourites on rotation, so it is a hint, not a fault, and it must not turn a good week amber.
The boundary warning counts like any other warning.

### Suggestions
The pool for each empty slot prefers, in order: compatible recipes neither in this week nor
recent; compatible recipes not in this week; all compatible recipes. Scores use the context,
so the Monday-lunch boundary is avoided naturally. Candidates get the reason
`planned_recently` (param `weeks_ago`) unless a warning reason applies (the boundary warning
reuses `twice_in_a_row`), sort after non-recent ones with the same score delta and are never a
"good pick". Archived recipes stay out of suggestions and candidates as before.

### Copy a week
`POST /api/weeks/{week_start}/copy` with `{ "from_week_start" }` copies the source week's meals
into the **empty** slots of the target only (like Suggest, never overwriting) and skips
archived recipes. The answer is `{ plan, copied, skipped_archived, source_meals }`: a typed
wrapper instead of headers. `source_meals` lets the client tell "the source week is empty" from
"nothing to fill". Both dates must be Mondays and differ (`422`); a unique-constraint race is a
`409` as for Suggest. The UI copies the previous week and offers Undo through `PUT` of the
previous plan.

### Cache freshness
A week's variety depends on the two weeks before it, so after a change to week W settles
(single-slot changes, suggest, clear, copy, undo) the frontend also invalidates W+1 and W+2.
A week with its own plan changes in flight is skipped, its settle step refetches it, so the
one-request-at-a-time queue and optimistic updates are untouched. Recipe edits already
invalidate every week.

## Consequences
- Variety of a week now depends on neighbouring weeks, so editing the past changes the hints
  of the following weeks; the cache invalidation keeps the UI consistent.
- Two extra queries per plan read (one per previous week); trivial for a household-sized DB.
- Planning far ahead before the near weeks exist gives no cross-week hints; they appear as the
  earlier weeks are filled.
- The window (two weeks) and the "recent repeats are score-neutral" choice are constants and
  one explicit skip, easy to revisit.
