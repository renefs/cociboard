# ADR-0020: Richer recipes (steps, servings, source link, leftovers)

## Status
Accepted

## Context
Recipes only had a name, meal type, protein, prep time, a free-text description and an
ingredient list. People kept the method and the original link in the description, and
batch-cooked dishes were planned a second time by hand as "Leftovers" with a note. We want
steps, servings and a source link without making the planner heavier, without touching
how the shopping list groups ingredients, and without letting a stored link become a
script injection.

## Decision
- **Steps are a JSON list of strings on the recipe row** (`recipe.steps`, NOT NULL, server
  default `'[]'`), like `ingredients` and `properties`. A steps table would add a join, ordering
  columns and per-step ids that nothing needs: steps are always read and written as a whole
  with their recipe, and are never queried. Each step is trimmed, empty ones are dropped,
  at most 1000 characters each and 50 steps. The cleaning lives in pure functions in
  `domain.py` (`clean_steps`) and is reused by the API schemas and the backup validation.
- **Quantities stay in the free-text ingredients.** Servings are a plain optional integer
  (1-50) shown for information; nothing scales ingredient amounts. The shopping list therefore
  groups exactly as before, and recipe search (`q=`) still looks only at name and ingredients.
- **The source link is an allow-list, not a block-list.** `clean_source_url` accepts only
  absolute `http://` and `https://` URLs with a host, at most 500 characters and no whitespace;
  `javascript:`, `data:`, `mailto:` and relative links are rejected with a 422 field error
  (and `invalid_document` in a backup). The frontend repeats the check (`isSafeSourceUrl`)
  in the form and again before rendering the anchor, so even a bad value that reached the
  database never becomes a link. The link opens in a new tab with `rel="noopener noreferrer"`.
- **`PATCH` semantics are unchanged**: only sent fields change, and `null` clears the optional
  fields (`servings`, `source_url`, like `description` and `prep_minutes`). `steps` cannot be
  `null`; send `[]` to clear it.
- **Backup format 3** writes the new fields; versions 1 and 2 are still read, with the fields
  defaulting to none. They are validated with the same rules as the API.
- **Leftovers are linked through the slot note.** "Save leftovers for the next meal" (offered
  for a slot holding a `batch_cooking` recipe) puts the existing `leftovers` special meal in the
  next slot of the same week with the recipe name as its note, in a single `PUT` of the
  slot (the API already accepts a note together with a special). There is no foreign key
  from the leftovers slot to the recipe: the note is plain data, survives recipe renames as
  history, and needs no schema change. The next-slot rule is the pure `nextSlotInWeek` /
  `leftoversTarget` (lunch to dinner, dinner to next day's lunch, nothing after Sunday
  dinner, only when that slot is empty) and the action goes through the optimistic, per-week
  serialised plan mutation.

## Consequences
- A recipe row grows by three columns; migration `0005` adds them in place (the batch
  operation is SQLite compatible) and existing recipes read as having no steps.
- Steps cannot be searched or reordered with SQL, which is fine for the sizes involved.
- Servings do not scale quantities; that would need structured ingredients and is out of
  scope.
- Leftovers are not tied to a recipe: deleting the recipe leaves the note text behind, and
  leftovers cannot cross a week boundary (Sunday dinner offers none).
