# ADR-0026: Household preferences

## Status
Accepted

## Context
Suggestions and the variety analysis used fixed numbers (at most 4 meals per protein, at least
2 vegetable-forward and 2 fish meals) and proposed any recipe, whatever the household eats.
Households differ: a vegetarian household has no use for a "little fish" tip, and nobody wants
Suggest to propose a spicy dish for children. The calendar export (ADR-0025) also hard-coded
14:00 and 21:00 for lunch and dinner.

## Decision
- **One settings row.** A `household_settings` table (migration `0007_household_settings`) holds
  a single row, `id` fixed to 1 by a `CHECK`. The row is written by the first save; until
  then reads answer the defaults without writing anything, so a fresh database and a migrated
  one behave the same and a GET never mutates. Property lists are JSON text, as for recipes.
  `PUT /api/settings/household` replaces the whole object (no PATCH: the form always has the
  full state, and one object is simpler to keep consistent and to put in a backup).
- **What is stored.** `required_properties` (the dietary four: vegetarian, vegan, gluten-free,
  dairy-free), `avoided_properties` (any property), `max_meals_per_protein` (1-14),
  `min_vegetarian_meals` and `min_fish_meals` (0-14, 0 switches the tip off), `lunch_time`
  and `dinner_time` (`HH:MM`). Range checks are ordinary Pydantic validation; the rules that
  span fields or are about format (a required property outside the dietary subset, the same
  property required and avoided, a malformed time) are one pure function,
  `household.validate_household`, answered as `422 { detail: { code } }`. The backup validation
  uses the same function.
- **Targets parameterise the pure rules.** `variety.VarietyTargets` (frozen dataclass, defaults
  equal to the old constants) is passed to `analyze_week`, `week_score`, the candidate
  ranking and the suggestion scoring. Issue params `max` / `min` come from the targets, so
  clients translate them unchanged. A minimum of 0 never raises its issue and gives no
  "adds fish / vegetable-forward" reason. The score formula is untouched.
- **Preferences filter proposals, never choices.** `suggest.allowed_by_preferences` requires
  every required tag and none of the avoided ones, using tags as they are (a recipe tagged
  only `vegan` does not count as vegetarian: inferring would silently change what the user
  sees tagged). `suggest_fills` only considers allowed recipes; when
  none fits, the slot stays empty, as it already did without a compatible recipe.
  `candidates_for_slot` still lists the others, last, with the `outside_preferences` reason
  and never as a good pick. Assigning
  a recipe with `PUT` is never checked, so a person can always overrule the preferences, and
  a recipe already planned stays planned when the preferences change. The slot picker is
  fed by the candidates, so it shows every compatible recipe, the allowed ones first.
- **Not included: number of people.** Ingredients are free text without quantities (ADR-0012),
  so a head count would have nothing to scale. Recipe `servings` stay informational. It can
  come back together with quantities.
- **Meal times feed the calendar export.** `weekAsIcs` takes the two times as options (default
  14:00 / 21:00); each event lasts one hour, and an event that crosses midnight ends on the
  next day. The planner passes the saved times; before they load, the defaults apply.
- **Backup format v5** adds `settings`. v1 to v4 documents restore the defaults (the row is
  deleted), like a missing pantry in v3. An inconsistent `settings` is `invalid_settings`.
- **Frontend.** One dialog opened from a header icon button. Saving is an optimistic mutation in
  its own serialized scope (`household`) that pauses offline; the dialog closes at once. After
  the last save settles, the household, every week (the variety report is part of the plan)
  and the candidate queries are refetched. Form state is kept as text so a number field can be
  empty while typing; the pure logic (`householdLogic.ts`) parses, validates and decides
  whether Save is enabled.

## Consequences
- Variety numbers are no longer constants in the UI or the docs: the tips follow the
  household. Weeks planned earlier are re-analysed with the new targets; nothing is stored per
  week.
- A household that requires tags nothing carries gets empty Suggest results; the toast says
  that preferences left slots empty. Recipes must be tagged for the diet to work.
- The slot picker shows recipes outside the preferences at the end of the list, marked, so
  overruling the preferences is possible from the picker too (on phones it is the main way
  to fill a slot). Hiding them would have made "never blocked" true only in the recipe panel.
- The settings are global (one household per installation), like the pantry.
