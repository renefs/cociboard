# ADR-0008: Recipe edits versus planned meals

## Status
Accepted

## Context
Since v0.5.0 recipes can be edited and deleted from the UI while they are already placed
in week plans (`MealAssignment` rows reference `recipe_id`). Three edits can interact with
those plans: renaming or changing any detail (harmless, plans only point at the recipe),
changing the **meal type** (a dinner-only recipe sitting in a dinner slot cannot become
lunch-only without breaking the slot rule from ADR-0005/0006), and **deleting** the recipe.

## Decision
- **Details are shared, not copied.** An assignment stores only the recipe id, so editing
  a name, ingredients, protein or properties updates every planned occurrence at once, in
  all weeks. Variety results change accordingly because they are computed from the live
  recipes.
- **Meal-type changes never silently break a plan.** `PATCH /api/recipes/{id}` computes the
  slots the recipe occupies that would no longer fit the new type (`fits_slot`, the same
  rule as assign/move). If there are any it answers `409` with a structured `detail`
  `{ code: "meal_type_conflict", message, conflicts: [{ week_start, day, slot }] }` and
  changes nothing. Duplicate-name conflicts keep their plain-string `detail`, so clients
  tell them apart by the type of `detail`.
- **`?force=true` resolves the conflict by removal.** The incompatible assignments are
  deleted and the change is applied in one transaction. The alternative of leaving
  incompatible recipes in place was rejected because it would violate the invariant that
  every planned meal fits its slot, which the grid, the suggestion algorithm and drag and
  drop all rely on. The UI lists the affected meals and offers "Remove them and save"; it
  never sets `force` without that explicit confirmation.
- **Deletion removes planned meals** (already the behaviour of ADR-0006). To make this
  informed, `GET /api/recipes/{id}/usage` returns `{ count }`, the number of planned slots
  across all weeks. The confirmation dialog shows it ("planned in 3 meals").
- **Cache invalidation.** After any recipe mutation the client invalidates the recipe
  lists, all week plans and the slot candidates, because plans embed recipes and
  deletions or forced changes alter slots.

## Consequences
- Editing is cheap and safe; the only destructive paths (forced meal-type change, delete)
  need an explicit confirmation that states the impact.
- There is no history of planned meals: a plan always reflects the current recipe, so
  renaming a recipe also renames it in past weeks.
- The usage count and the conflict list are computed on demand with an indexed
  `recipe_id` lookup; no schema change or migration was needed.
