# ADR-0023: Pantry staples

## Status
Accepted

## Context
Staples such as olive oil, salt or garlic appear in most recipes, so they show up in the
shopping list every week and bury what actually has to be bought. This was an accepted
limitation since v0.9.0 (ADR-0012). Ingredients are free text without quantities, grouped by
`ingredient_key` (case and accents folded, whitespace collapsed).

## Decision
- **Global pantry, not per week.** A `PantryItem` (`key` unique, `name`, `created_at`) is shared
  by every week. Staples are by nature "always at home"; a per-week flag would have to be set
  again every Monday, which is the clutter we want to remove. Migration `0006_pantry`.
- **Exact matching on the folded key.** A shopping item is `in_pantry` when its key equals a
  pantry key. "Aceite de oliva", "aceite de oliva" and "Aceite de Oliva" match;
  "Aceite de oliva virgen extra" does not. Fuzzy or prefix matching would hide things that must
  be bought ("leche" vs "leche de coco"), and a false match is worse than a staple listed twice.
  The cost is one pantry entry per spelling; the pantry panel and README say so. The client
  mirrors the key function (`ingredientKey` in `pantryLogic.ts`) only to flag items
  optimistically; the server is the source of truth and the flags are refetched when settled.
- **Suggestions come from recipe frequency, not a built-in list.** Recipe content is user data
  and multilingual (ADR-0009), so a hard-coded list of staples would only fit one language and
  one kitchen. `suggest_staples` (pure, `pantry.py`) counts the ingredients of the active
  (non-archived) recipes once per recipe, drops keys already in the pantry and ingredients used
  by fewer than 3 recipes, and returns the top 8 (count descending, then key).
- **Idempotent add.** `POST /api/pantry` returns `201` for a new item and `200` with the existing
  one when the key exists (never `409`), so a retry or a double tap is harmless. Items are
  removed by id (`DELETE`, `404` if missing).
- **Ticks stay per week.** A tick on a pantry item is stored as before; it is only displayed in
  the pantry section. Extras are never pantry items.
- **Backup format v4** adds `pantry: [{ name }]`; the key is derived on restore. v1 to v3 files
  restore an empty pantry; a restore replaces the pantry like everything else. Names are
  validated like the endpoint (1-80 characters, a usable key, no duplicate key).
- **Frontend.** Pantry mutations use one serialized scope (`pantry`) and update the pantry query
  and every cached shopping list optimistically; a failure restores all snapshots and shows the
  usual toast. Removing a staple sends its server id, or looks it up when the item was added a
  moment ago and its real id is not known yet. Being ordinary mutations, they pause offline
  and are counted by the offline banner without further work.

## Consequences
- The list to buy is short from the first week once a few staples are marked.
- Pantry entries must match the ingredient wording exactly; renaming an ingredient in a recipe
  makes it appear in "to buy" again until that spelling is added.
- The shopping list endpoint reads the pantry keys on every call (one small query).
- Suggestions are recomputed on each `GET /api/pantry` by scanning the active recipes; at the
  scale of a household recipe list this is negligible.
