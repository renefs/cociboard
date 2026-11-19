# ADR-0016: Special meals and slot notes

## Status
Accepted

## Context
Real weeks contain meals that are not a recipe: eating out, leftovers, a free night. A slot
could only hold a recipe, so those slots stayed empty and **Suggest** filled them with
recipes nobody wanted to cook. There was also nowhere to jot a note on a meal ("double
batch", "Ana's birthday").

## Decision

### Data model
- `MealAssignment.recipe_id` becomes nullable and the table gains `special` (a `SpecialMeal`
  value: `eating_out`, `leftovers`, `free`) and `note` (at most 120 characters, trimmed, an
  empty note is `null`). A slot holds **exactly one** of `recipe_id` and `special`. The rule
  is enforced in code (`MealContent` validation, `planner._check_content`) and by the CHECK
  constraint `ck_meal_recipe_or_special`, which works with SQLite batch mode.
- Migration `0004_slot_special_and_note` rebuilds the table with `batch_alter_table(recreate=
  "always")`. The foreign key to `recipe`, both indexes and `uq_week_day_slot` are reflected
  and survive the rebuild; existing rows are kept with `special` and `note` null. Like 0003 it
  does nothing when the columns already exist (databases stamped from a `create_all` schema).
  Downgrade deletes the rows with a special meal (they cannot be represented), drops the
  constraint and the columns and makes `recipe_id` NOT NULL again; notes of recipe rows are
  lost. `test_migrations.py` covers upgrade with data, the surviving FK/index/unique
  constraint, the CHECK, and downgrade.

### API: additive `DayPlanRead`
`lunch`/`dinner` stay a recipe or `null`; the new `lunch_special`, `dinner_special` and
`lunch_note`, `dinner_note` are added next to them. Existing clients keep working (a special
slot looks like an empty one to them) and nothing had to be renamed or nested. The price is
four more fields instead of a single `meal` object; a discriminated `meal` would have broken
every consumer of the week plan.

- `PUT .../days/{day}/{slot}` and the entries of `PUT /api/weeks/{week_start}` (Undo) take
  `recipe_id` **or** `special`, plus `note`. Neither or both is `422`.
- **Note semantics on replace:** the note sent is the note stored; omitting it clears it.
  The server never guesses. The frontend sends the slot's existing note when a recipe or a
  special replaces the content of a filled slot (a note such as "Ana's birthday" is about the
  occasion, not the dish), and the note can then be edited or removed.
- `PATCH .../days/{day}/{slot}/note` with `{ "note": string | null }` sets or clears the note
  of a filled slot (`404` when the slot is empty, `422` when it is too long).
- `move` moves or swaps the whole entry (recipe or special, with its note). The meal-type fit
  check applies to recipes only; a special fits any slot.
- Copy last week copies special meals and notes into empty slots only; skipping archived
  recipes is unchanged. Clearing a slot deletes its note.

### Variety, suggestions and shopping
- A special slot contributes no meal (`None` in the 14-meal list) but is **not empty**:
  - it breaks a consecutive-protein run, does not count as filled for the vegetable and fish
    thresholds, and a week with only special meals has no score yet (`filled_slots` counts
    recipes);
  - the previous week's Sunday dinner being a special means there is no
    `previous_week_protein` context;
  - `suggest_fills(..., occupied=...)` receives the indices of every filled slot and never
    fills those. Candidates for a slot work as before (the baseline empties the slot, so
    "Replace" on a special lists recipes normally).
- The shopping list ignores special meals; notes are never part of it.
- Specials never get a warning marker (variety issues only list slots with meals), and recipe
  usage counts ignore them.

### Backup format version 2
Meals gain optional `special` and `note`, and `recipe_ref` becomes optional. Export writes
version 2. Restore accepts versions 1 and 2: a version 1 meal has `recipe_ref` and neither of
the new fields, which is a valid version 2 meal. New validation codes:
`meal_needs_recipe_or_special` (both or neither) and `note_too_long` (a blank note is
accepted and stored as none). Unknown special values are `invalid_document`.

### Frontend
`specialMeta.ts` is the single map from a special to its icon and label key (🍴 eating out,
♻️ leftovers, 🌴 free). `slots.ts` gains `SlotMeal` (recipe or special, with the note);
`planTransforms.ts`, `dragLogic.ts` and `planToFills` work on it, so specials are draggable,
swappable and announced by their label like recipes. Specials are set from three chips in the
picker (44 px targets) and edited from the slot actions, which also hold the note form.

## Consequences
- A week can say what it really is, and Suggest respects it.
- Slot rows are now "something or nothing", so any new code that reads `recipe_id` must handle
  `None` (the type checker finds these).
- Downgrading past 0004 loses special meals and notes.
- A note is plain text on a slot; richer per-day notes would need a place of their own (ADR-0006
  noted there is no week table).
