# ADR-0027: Favourites and history

## Status
Accepted

## Context
A catalogue grows, and two questions come up while planning: "which of these do we actually
like?" and "when did we last eat this?". The plan already knows the second answer: every
planned meal is a row with a week and a day. Suggestions are driven by variety and by the
household preferences (ADR-0007, ADR-0026), and we want to keep them explainable.

## Decision
- **Favourite is a column.** `recipe.favourite` is a NOT NULL boolean with a server default of
  false (migration `0008_recipe_favourite`, batch operations so SQLite is happy), so existing
  rows become non-favourites. It is part of `RecipeCreate`, `RecipeRead` and `RecipeUpdate`
  (never `null`). Changing it never triggers the meal-type conflict check and works on
  archived recipes. `GET /api/recipes?favourite=true` filters, combined with the other filters.
- **Favourites are a user shortcut, not a rule.** Suggest, slot candidates and the variety
  score ignore them. Preferring favourites would silently weaken variety, and the "why" of a
  suggestion would stop being about the week. A person who wants a favourite picks it.
- **History is derived, not logged.** There is no history table: a recipe's history is a
  function of `meal_assignment`, so it can't drift from the plan, it follows edits, moves and
  clears for free, and a restore needs no extra data. The cost is that the history only
  reflects the plan as it is now: a meal removed from the plan is forgotten.
- **"Made" means planned on or before today.** A meal date is `week_start + day`. Today's meals
  count as made (the dinner planned for tonight is "made today" from the morning on), so
  `last_planned_on` is the latest meal date <= today, `times_planned` counts the meals <= today
  and `next_planned_on` is the earliest meal date > today. Special meals have no recipe and are
  ignored. "Today" is the server's date, passed in from the route layer (the existing
  `get_today` dependency) so the pure functions in `history.py` are tested with fixed dates.
  The browser compares with its own clock only to word "3 weeks ago".
- **One query for the list.** `RecipeRead` gains `last_planned_on`, `next_planned_on` and
  `times_planned`. The `/api/recipes` endpoints read `(recipe_id, week_start, day)` of every
  recipe meal in one query and fold it in `history.summarize_by_recipe`, so the list costs two
  queries however many recipes there are (no N+1). Recipes embedded in week plans and slot
  candidates keep the defaults (`null`, `null`, 0): those views don't use them, and filling them
  would add a query to every plan read.
- **History endpoint.** `GET /api/recipes/{id}/history?limit=` (default 10, at most 50)
  returns the totals and the latest planned meals, most recent first and upcoming ones
  included, each with `upcoming` set by the server so the client doesn't re-derive it.
- **Backup format 6** writes `favourite` per recipe; versions 1 to 5 stay readable and restore
  with no favourites. History is not stored: it comes back with the plan.
- **Frontend.** The star is optimistic: all cached recipe lists change at once, requests are
  sent one at a time (a mutation scope) and pause offline, and a failure puts back that one
  recipe (not a snapshot of the lists) and shows a message. The star stops pointer and touch
  events from reaching the card's drag listeners. Plan changes invalidate the recipe lists and
  the history once the last change settles, so the history fields stay fresh without touching
  the one-request-at-a-time optimistic behaviour. The new sort "Not made lately" is a pure
  function next to the variety sort.

## Consequences
- Favourites and history cost one column and no new table; the history can never contradict the
  plan.
- A deleted recipe or a cleared slot removes its history; archiving keeps it (the meals stay).
- The server's date decides what counts as made, so a client in another time zone may be a day
  off around midnight; the card wording only has day precision and tolerates this.
- A favourite may be a poor variety choice; nothing warns about it, which keeps the variety
  tips about the week only.
- Reading the whole recipe-meal set grows with the number of weeks planned (a few rows per
  week). If that ever matters, a grouped SQL query on a stored meal date can replace it
  without changing the API.
