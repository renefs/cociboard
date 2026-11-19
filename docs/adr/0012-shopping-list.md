# ADR-0012: Shopping list

## Status
Accepted

## Context
A planned week already tells us what will be cooked. Shopping for it means collecting the
ingredients of every meal, buying them and keeping track of what is already in the basket,
possibly from a phone while someone else adds items at home. Ingredients are free-text
strings ("Lentejas pardinas", "Aceite de oliva") without quantities or units.

## Decision
- **The backend computes the list.** `shopping.aggregate` is a pure function over the
  week's meals in day/slot order. The key of an ingredient is its case- and accent-folded
  text with whitespace trimmed and collapsed (`ingredient_key`, built on `fold_text`);
  the display name is the first spelling met. Each item lists the meals that use it; an
  ingredient repeated inside one recipe counts once for that meal. Items are sorted by
  key. Nothing is stored for generated items, so the list always follows plan and recipe
  edits.
- **Ticks are stored per week and key.** `ShoppingCheck(week_start, item_key)` is unique;
  a row means checked. Checking is idempotent and an `IntegrityError` race is treated as
  already checked. Rows of keys that are no longer in the plan are kept but not shown, so
  a meal swapped out and back in keeps its tick.
- **Manual items.** `ShoppingExtra(week_start, name, checked, created_at)` holds items
  added by hand (1-80 characters after trimming), returned in creation order. "Uncheck
  all" clears both kinds.
- **One response shape.** Every endpoint under `/api/weeks/{week_start}/shopping-list`
  returns the full list, so the client can update optimistically and reconcile with the
  server response or a refetch.
- **No migration.** Only new tables are added, and `create_all` creates missing tables
  on existing databases; no existing table changes.
- **No quantities.** Ingredients are free text, so aggregation is grouping equal
  ingredients, not summing amounts.
- **Client.** The dialog is opened from the planner toolbar and shares the `Modal`
  component. The query `["shopping", weekStart]` is invalidated when the plan settles
  after a change, after Suggest / Clear / Undo and after recipe edits. Copy and Share use
  a plain-text export of the unchecked lines (`shoppingListText`).

## Consequences
- Ingredient spellings that differ beyond case, accents and spacing ("tomate" vs
  "tomates") stay separate items; fixing that needs normalisation or structured
  ingredients.
- Without quantities the list says what to buy, not how much; the "×N" count only says in
  how many meals an ingredient is used.
- Possible follow-ups: a "from today" filter that skips meals already eaten, pantry
  staples that are never listed, grouping by category or aisle.
