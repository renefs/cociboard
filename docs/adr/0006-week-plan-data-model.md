# ADR-0006: Week plan data model keyed by ISO-week Monday

## Status
Accepted

## Context
Menus are planned per week, Monday to Sunday. The planner must read and write single
slots, move recipes between slots, survive recipe deletion, and later support week
navigation, variety analysis (v0.4.0) and copying weeks.

## Decision
- A week is identified by the **date of its Monday** (`week_start`, e.g. `2026-10-26`),
  which is also the ISO-week start. The API path is `/api/weeks/{week_start}`; a date that
  is not a Monday is rejected with `422`, so every week has exactly one key and clients
  cannot create overlapping weeks. `week_start_for(date)` in `domain.py` derives the
  Monday from any date; `GET /api/weeks/current` uses it for today.
- There is **no week table**. A single table `MealAssignment(week_start, day, slot,
  recipe_id)` stores only filled slots, with a unique constraint on
  `(week_start, day, slot)`. An empty week has no rows, and reading a week always returns
  seven days with null slots, so there is nothing to create, migrate or clean up.
  `day` is 0 (Monday) to 6 (Sunday); `slot` is the existing `MealSlot` enum.
- **Compatibility is enforced on the server** with the existing `fits_slot` rule for
  assign and move (`422`); an unknown recipe is `404`. Moving into an occupied slot swaps
  the two recipes, and both must fit their new slots, so a move is atomic and never loses
  a recipe. Moving or clearing is idempotent where possible (clearing an empty slot and
  dropping a recipe on its own slot succeed without change).
- **Deleting a recipe deletes its assignments** in the repository inside the same
  transaction. SQLite does not enforce foreign keys by default, so this is done
  explicitly rather than relying on `ON DELETE CASCADE`, and is covered by a test.
- Responses are the full `WeekPlanRead` (seven days with the embedded recipes), so the
  client can replace its cache after any mutation. Plan logic lives in `planner.py`
  (persistence and rules) with thin routes in `routers/weeks.py`.
- The frontend derives the current Monday from the browser's local date and requests
  `/api/weeks/{week_start}`, so "this week" follows the user's time zone rather than the
  server's.

## Consequences
- Week navigation, "clear week" and copying are simple queries on `week_start`.
- Duplicate use of one recipe in a week is allowed (v0.4.0 will flag it).
- Past weeks keep their assignments; deleting a recipe empties its slots in all weeks.
- Without a week table there is no place for per-week metadata (notes, names); add one
  if that is ever needed.
