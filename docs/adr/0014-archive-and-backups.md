# ADR-0014: Archived recipes and exportable backups

## Status
Accepted

## Context
Two ways to lose data silently:

1. Deleting a recipe removed every planned meal that used it, in every week, past ones
   included (`repository.delete_recipe`). People delete recipes they no longer cook, and
   their history changed behind their back.
2. The only backup was copying the SQLite file with the container stopped, which is not
   something a person using the app from a phone can do.

## Decision

### Archive vs delete
- `Recipe.archived_at` (nullable timestamp, migration `0003_recipe_archived_at`).
  `RecipeRead.archived` is derived from it; `PATCH /api/recipes/{id}` accepts
  `archived: bool` and only flips the flag.
- Archived recipes are **hidden where new choices are made**: `GET /api/recipes` (unless
  `?archived=true`, which returns only them), slot candidates and `suggest`. They are
  **kept where history is shown**: week plans (with `archived: true`, marked in the UI),
  variety analysis, shopping lists and the usage count.
- Assigning an archived recipe to a slot (`PUT .../days/{day}/{slot}`) answers `422` with
  `detail: { code: "recipe_archived", message, recipe_id }`. Moving, swapping and clearing
  meals that already use one stay allowed.
- **Undo uses `replace_week`, which accepts archived recipes.** "Clear week" deletes the
  assignments, so "only allow archived recipes that were already in the week" cannot be
  decided afterwards without storing history; and refusing would break Undo after Clear
  week when a recipe was archived in between. The cost is that a client can place an
  archived recipe with `PUT /api/weeks/{week_start}`; the UI never does, and the endpoint's
  contract is "restore this exact plan".
- Deleting stays available and destructive. The UI, when the recipe is planned somewhere,
  says how many meals disappear (past weeks included) and recommends **Archive instead**.
- Names stay unique across archived and active recipes (a unique index on `name`); creating
  or renaming onto an archived name answers `409` with
  `detail: { code: "duplicate_name", message, archived }` so the UI can say "restore it".
  The previous plain-string detail became this object; the frontend accepts both.
- Seeding looks at all names, so an archived seed recipe is not added again.

### Backup format (v1)
`GET /api/backup` returns one JSON document, with
`Content-Disposition: attachment; filename="cociboard-backup-YYYY-MM-DD.json"`:

```
{ format: "cociboard-backup", format_version: 1, app_version, exported_at,
  recipes: [{ ref, name, description, meal_type, protein, prep_minutes, ingredients,
              properties, archived, created_at }],
  meals: [{ week_start, day, slot, recipe_ref }],
  shopping_checks: [{ week_start, item_key }],
  shopping_extras: [{ week_start, name, checked, created_at }] }
```

- Plain JSON, human-readable, no database ids: `ref` is the source id used only to link
  meals to recipes, and is re-mapped to new ids on restore.
- `format_version` is an integer bumped on **incompatible** changes. A reader accepts
  exactly the versions it knows and answers `unsupported_version` for others; additive
  fields keep version 1 (unknown fields are ignored). `app_version` is informational.
- The archive moment is not exported (only the `archived` flag); a restored archived recipe
  gets the restore time.

### Restore replaces everything
- `POST /api/backup/restore` deletes all recipes, meals and shopping data and inserts the
  document in **one transaction**; any failure rolls back and leaves the data untouched.
- The whole document is validated before anything is written (`backup.parse_backup`, pure):
  format, version, recipe rules as in `RecipeCreate`, unique names and refs, known
  `recipe_ref`s, Mondays, day 0-6, no duplicate slot, meal type fits slot, no duplicate
  shopping check. Failures are `422` with `detail: { code, message, params }`
  (codes and params, never translated text, as in ADR-0009). Bodies above 10 MB get `413`.
- **Server-side safety copy.** For a file-based SQLite database, the existing online-backup
  helper (now `dbfiles.backup_sqlite`, shared with the migration backup) writes
  `cociboard.db.bak-pre-restore-<UTC timestamp>` before the replacement. Copies rotate:
  the three most recent `pre-restore` copies and, separately, the three most recent
  migration copies are kept, so a restore cannot push out the copy taken before a schema
  upgrade, or the other way round.
- **No merge import.** Merging needs conflict rules (same name, different ingredients;
  same slot, different recipe; ticks of changed lists) that users cannot see or control in
  a file picker, and a half-merged database is hard to reason about. Replace-only is
  predictable, testable as a round trip, and the safety copy makes it recoverable.

## Consequences
- Nothing is lost by accident through the UI any more: archive is the default suggestion,
  delete is explicit, restore is confirmed and recoverable.
- Disaster recovery by copying the SQLite file still works and is documented; the JSON file
  is the portable, version-tolerant path (and can move data between installations).
- A backup contains everything, so people should treat the file as private.
- Restoring changes ids; nothing outside the database holds recipe ids (plans are rebuilt
  from the file), so this is invisible except to API clients that cached ids.
