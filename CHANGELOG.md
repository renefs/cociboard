# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.28.2] - 2026-11-22

### Fixed
- Backups can be restored again from the Backup dialog. Since v0.24.0 the server has
  exported backups in format version 6, but the browser still accepted only versions 1 to 5
  and refused every new backup with "That backup was made by a newer version of Cociboard"
  before uploading it. The server always accepted the file.

### Added
- A backend test that fails when the backup versions in `frontend/src/api/types.ts` and
  `backup.py` disagree, and an end-to-end test that downloads a backup and restores it
  through the dialog.

## [0.28.1] - 2026-11-21

A new set of starter recipes. No app, schema or API change.

### Changed
- The 33 starter recipes are replaced by a new set of 33 classic Spanish recipes (salmorejo
  cordobés, fabada asturiana, marmitako, pollo al chilindrón, croquetas de jamón and so on),
  with the same mix: 10 for lunch, 10 for dinner and 13 for either, with servings, ingredients
  and 4 to 8 steps each. The user guide's demo week uses them.

### Upgrading
- Existing databases are not changed on startup: only an empty database is seeded.
- Running `make seed` (or the container seed command) on an existing installation now **adds
  the 33 new recipes**, because their names differ from the old ones. Skip it unless you want
  them. Recipes you already have keep their names, steps and plans.

## [0.28.0] - 2026-11-20

An illustrated user guide in English and Spanish, published to GitHub Pages
([ADR-0030](docs/adr/0030-user-guide-site.md)), and a documentation review. No app, schema or
API change.

### Added
- **User guide** (`userguide/`): a MkDocs Material site with eleven pages for the people who
  plan the menus (getting started, planning, variety, recipes, shopping list and pantry, print
  and share, household preferences, the phone and offline use, backups, questions and answers)
  plus a short installation page, in English and Spanish, with a language switcher, search and
  dark mode. `make docs` builds it with `--strict` (broken links and anchors fail),
  `make docs-serve` previews it.
- **Generated screenshots**: `make docs-screenshots` drives the built app with Playwright
  (`frontend/playwright.userguide.config.ts`, `frontend/userguide/`), plans a demo week with the
  starter recipes and writes 21 pictures per language, desktop and phone, into the guide.
- `.github/workflows/userguide.yml` builds the guide on pull requests that touch it and
  publishes it to GitHub Pages from `main`. Dependabot updates its Python packages.
- `COCIBOARD_SESSION_DAYS` is passed through both compose files (default 90) and listed in
  `.env.example`.

### Changed
- README: link to the user guide; the missing ADRs (0024, 0025, 0028) in the list; the variety
  thresholds are described as household settings with defaults; `COCIBOARD_SESSION_DAYS` in
  the settings table; the image tag example uses the current version; the project structure
  lists `features/auth`, `pwa/`, `sw/`, `offline/`, `docs/reviews/`, `userguide/` and
  `AGENTS.md`.
- AGENTS.md: the frontend layout lists every feature folder and the offline modules, and says
  when to update the guide and its screenshots.
- `.dockerignore` leaves `docs/` and `userguide/` out of the image build context.

## [0.27.0] - 2026-11-20

Seed recipes with steps and servings. No schema or API change.

### Added
- **All 33 seed recipes now have servings and 4 to 8 cooking steps** (Spain Spanish, imperative
  mood, with heat levels and times that match the prep time). A new database gets them on first
  start. Two recipes got an ingredient their steps already needed (olive oil in
  "Patatas a la riojana" and "Pisto manchego").
- **`make seed` fills in existing seed recipes.** A recipe whose name matches a seed recipe
  (case-insensitive) and that has no steps and no servings gets the seed steps and servings;
  a recipe with any steps or any servings is never touched. Archived ones are filled too. The
  command prints both counts: `Seeded N new recipe(s), filled steps for M existing recipe(s)
  (33 in catalogue).`

### Changed
- `seed_recipes` returns a `SeedResult` (inserted, filled) instead of a number. Startup is
  unchanged: it only seeds an empty database and never fills existing recipes.
- Ruff ignores the line-length rule in `seed.py`, so each Spanish step stays on one line.

### Upgrading
- Existing installations keep their recipes as they are. To add the steps and servings to the
  seed recipes you already have, run `make seed` (source checkout) or
  `docker compose exec --user 1000:1000 cociboard python -m cociboard.seed` (Docker; use your
  `PUID:PGID`). See "Starter recipes" in the README.

## [0.26.0] - 2026-11-20

Offline edits that survive closing the app ([ADR-0029](docs/adr/0029-persisted-offline-edits.md)).
No schema or API change.

### Added
- **Waiting changes are stored on the device.** Plan changes, shopping ticks and extras, pantry
  changes, household preferences and favourite toggles that are waiting for the connection are
  kept in `localStorage` (`@tanstack/react-query-persist-client`). After closing, reloading or a
  killed PWA the app shows them applied and the banner counts them; they are sent in the original
  order per week/list as soon as the connection is there.
- Stored changes older than 7 days, or written in another stored format, are discarded with a
  dismissible notice saying how many. A restored change the server rejects is dropped with an
  error notice. A `401` (expired password session) keeps the changes waiting until the next
  sign-in, then sends them.
- Only one tab restores and sends the stored changes (Web Locks); another takes over when it
  closes.
- Playwright: changes made offline survive a reload while offline and are sent in order when the
  connection returns; the same when the app is closed and reopened online.

### Changed
- Waiting changes are no longer written into the query cache. The cache holds the server's data
  and every read overlays the pending mutations on it with the pure `apply…` functions, so a
  restored change looks exactly like one made a moment ago, and a failed change simply stops
  being overlaid (no snapshot rollback). Plan requests are serialised by a TanStack mutation
  `scope` per week instead of an in-memory chain.
- Logging out and restoring a backup discard the waiting changes.

### Fixed
- Reloading the app while offline with a password set (or any time the auth status could not be
  read) left it stuck on "Loading…", unmounting and remounting the app in a loop.

## [0.25.1] - 2026-11-20

### Fixed
- Keyboard drag and drop: picking up a planned meal with Space started the drag over a
  neighbouring slot (for example "over Tuesday dinner" when picking up from Wednesday dinner),
  so pressing Space again at once moved the meal there. The meal's own slot now stays a drop
  target while it is dragged, so a keyboard drag starts over it ("is over its own slot") and an
  immediate drop leaves the meal in place and announces that it was not moved. Arrow keys work
  as before, and an arrow can now also bring the meal back to its own slot. The rule is the
  pure `acceptsDrop` in `dragLogic.ts`, with Vitest coverage of the pick-up collision.
- E2E: the keyboard spec no longer accepts any first slot after a pick-up and gains a
  "pick up and drop at once" test. `pickUpWithKeyboard` waits until dnd-kit's keyboard sensor
  listens for keys (it starts in a timer after the pick-up), so a key pressed straight away is
  not taken as a click on the meal's button.

## [0.25.0] - 2026-11-20

End-to-end tests with Playwright ([ADR-0028](docs/adr/0028-end-to-end-tests.md)). No schema or
API change.

### Added
- A **Playwright suite** (`frontend/e2e/`, `frontend/playwright.config.ts`) that drives the real
  app in Chromium: the built frontend served by the real backend on a real SQLite file, at a
  desktop (1440×900) and a phone (375×812, touch) size. `make e2e` builds the frontend and runs
  it; `npx playwright install chromium` is needed once. It covers planning (Add, a real mouse
  drag, moving and clearing, the variety indicator), keyboard planning with the announcements,
  Suggest and Copy last week, the phone tab bar, slot picker and Today view (no horizontal
  scroll), recipes (create, search, edit, favourite, archive, restore, history), the shopping
  list and pantry, household preferences, Spanish, the password sign-in, axe accessibility scans
  and an offline edit with the production service worker.
- A CI job `e2e` in `ci.yml` (Playwright browser cached by version, report and traces uploaded
  when it fails). `docker-publish.yml` calls the whole workflow, so the image is only published
  when the E2E tests pass too.
- `typecheck` and ESLint cover the E2E code (`tsconfig.e2e.json`); Vitest ignores it.

### Fixed
- Accessibility (WCAG 2.5.3, Label in Name, found by axe): the accessible name of the variety
  badge and of a planned slot now contains the text shown in them, in the same order. The
  badge reads "90 Variety: No issues (score out of 100)" instead of "Variety score 90 out of
  100. No issues"; a slot with a note reads "Paella, double batch, Monday lunch." with the
  note after the name (and after "archived" for an archived recipe) instead of at the end. The
  badge chevron is drawn by CSS so it is not part of the button's text.
- The drag chip's drop animation now respects `prefers-reduced-motion` (it is skipped).

## [0.24.0] - 2026-11-20

Favourites and history ([ADR-0027](docs/adr/0027-favourites-and-history.md)). Schema change
(migration `0008_recipe_favourite`) and backup format version 6.

### Added
- **Favourites**: a star on every recipe card and in the recipe details marks a favourite
  (`aria-pressed`, a 44px target, an accessible name per state). The star is optimistic, sent
  one request at a time, paused offline and rolled back with a message when saving fails. A
  press on the star never starts a drag or selects the card.
- A **Favourites** filter chip in the recipe panel, combined with search, meal type and
  properties, with its own empty message.
- Favourites show as a small star in the slot picker. Suggest ignores them.
- **History** derived from the plan, relative to the server's date (a meal counts as made on
  or before today): each card says "Last made 3 weeks ago" or "Never planned", the recipe
  details have a **History** section (planned N times, the next meal, the latest meals with
  upcoming ones marked), and the new sort **Not made lately** lists recipes never planned
  first, then the ones planned longest ago.
- `Recipe.favourite` (`false` by default), accepted by `POST` and `PATCH` (never `null`), and
  `GET /api/recipes?favourite=true`.
- `last_planned_on`, `next_planned_on` and `times_planned` on recipes of `/api/recipes`
  (computed with one query for the list), and `GET /api/recipes/{id}/history?limit=`
  (default 10, at most 50).
- Backup format version 6 includes `favourite`; backups of versions 1 to 5 restore with no
  favourites.

### Changed
- Plan changes refresh the recipe lists and histories once the last change has settled.

## [0.23.0] - 2026-11-20

Household preferences ([ADR-0026](docs/adr/0026-household-preferences.md)). Schema change
(migration `0007_household_settings`) and backup format version 5.

### Added
- **Household preferences** dialog, opened with the new ⚙️ button in the header:
  - **Diet** (vegetarian, vegan, gluten-free, dairy-free): Suggest only proposes recipes
    tagged with all of them.
  - **Avoid** (any recipe property): Suggest skips recipes with any of them. A property can't
    be both.
  - Preferences never block a choice by hand: the slot picker lists the recipes they leave
    out at the end, marked "Outside your household preferences" and never as a good pick.
  - **Variety targets**: the most meals with one main protein (1-14) and the fewest
    vegetable-forward and fish or seafood meals (0-14; 0 switches that tip off). The variety
    tips and the score follow them.
  - **Meal times** for lunch and dinner, used by the calendar export.
- `GET` / `PUT /api/settings/household` (a single settings row; the defaults apply until the
  first save). Errors are `422 { detail: { code } }`: `invalid_time`, `not_dietary`,
  `required_and_avoided`.
- Backup format version 5 includes the household settings; backups of versions 1 to 4 restore
  with the defaults.
- Suggest says when household preferences left slots empty.
- The calendar export (.ics) starts events at the saved meal times; an event that crosses
  midnight (such as a 23:30 dinner) ends on the next day.

### Changed
- `variety.analyze_week`, `week_score`, `candidates_for_slot` and `suggest_fills` take the
  variety targets and preferences; the defaults equal the previous constants.
- Dependency updates merged from Dependabot since 0.22.1: React 19 (`react`, `react-dom` and
  their types), i18next 27 and react-i18next, and jsdom 31.

### Fixed
- Screen readers no longer announce every change to a recipe card (such as the "this week"
  badge): the recipe list and the slot picker's list were `aria-live` regions. Only the number
  of results is announced, through a separate status message.

## [0.22.1] - 2026-11-20

### Fixed
- Dependabot no longer opens update PRs that can't pass on their own:
  - `react`, `react-dom` and their type packages arrive in one PR, majors included;
  - `i18next` and `react-i18next` arrive in one PR as well;
  - TypeScript majors are ignored until typescript-eslint supports them;
  - the Docker image's Python only gets patch updates, since its minor version moves
    together with `backend/.python-version` and `requires-python`.

### Changed
- Dependency updates merged from Dependabot: the Python and npm minor/patch groups.

## [0.22.0] - 2026-11-20

Print and share ([ADR-0025](docs/adr/0025-print-and-share.md)). Frontend only: no API, schema or
migration changes.

### Added
- **Share menu** in the planner toolbar (also in the phone's Week tab): **Print the menu**,
  **Share the menu** (**Copy the menu** where the browser has no share sheet) and **Add to
  calendar (.ics)**. The items are disabled, with an explanation, while the week has no meals.
- **Printing** the week menu (a days by lunch/dinner table with the notes and special meals) and
  the shopping list (a checklist with an empty box per item, then the bought and pantry items in
  small print). A print stylesheet shows only the printout: black on white, A4 portrait, no
  backgrounds, days kept together.
- **Calendar export**: a client-side iCalendar file `cociboard-<week>.ics` with one event per
  planned meal (lunch 14:00-15:00, dinner 21:00-22:00, floating local times), the note and the
  ingredients as description and the recipe link as URL. UIDs are stable, so importing a later
  export updates the events. Touch devices that can share files hand it to the calendar app.
- **Manual copy dialog**: when neither the share sheet nor the clipboard is available (plain-http
  access to the server has no clipboard API), the text is shown selected, ready to copy.
- English and Spanish texts for all of the above.

### Changed
- The shopping list's **Copy** and **Share** buttons are one button that shares where possible
  and copies otherwise (**Share** or **Copy** by capability), plus a new **Print** button. A
  clipboard failure now opens the manual copy dialog instead of an error toast.

## [0.21.0] - 2026-11-20

Import a recipe from a link ([ADR-0024](docs/adr/0024-recipe-import.md)).

### Added
- **Import from a link** at the top of the new-recipe form: paste a recipe page address and the
  name, description, servings, time, ingredients, steps and source link are filled in from the
  page's schema.org `Recipe` data. Nothing is saved until the form is submitted; the user is
  asked before typed content is replaced; translated notes explain what was shortened or not
  found, and a recipe with the same name is flagged.
- `POST /api/recipes/import` answers a draft or `{ detail: { code } }` (`invalid_url`,
  `blocked_address`, `no_recipe_found`, `fetch_failed`, `timeout`, `too_large`, `not_html`,
  `busy`, `import_disabled`). Setting `COCIBOARD_RECIPE_IMPORT` (default `true`) turns it off;
  the form then hides the option after the first attempt.
- **Share target** for the installed Android app: sharing a link to Cociboard opens the new-recipe
  form and imports it; the share parameters are removed from the address bar.
- English and Spanish texts for the import, its warnings and its errors.

### Security
- The server fetches user-supplied addresses, so the import refuses non-public destinations
  (SSRF): http(s) on ports 80 and 443 only, no userinfo; every resolved address must be public
  (including IPv4 addresses hidden in IPv6 forms); the connection is pinned to the vetted address
  (TLS name and `Host` kept); redirects are followed manually and re-validated at every hop;
  2 MiB and 15 s limits, text content types only, no proxies, cookies or credentials sent, two
  imports at once.

### Changed
- `httpx` is now a runtime dependency (it was a development one).

## [0.20.0] - 2026-11-20

Pantry staples in the shopping list ([ADR-0023](docs/adr/0023-pantry-staples.md)).

### Added
- A global pantry of staples (oil, salt, garlic...). Shopping items whose ingredient matches a
  pantry item exactly (case, accents and spacing folded) leave **To buy** and **In the basket**
  for a collapsed **In the pantry** section; they are ignored by the progress and by Copy/Share,
  which end with an "Also check at home" line. **Always at home** and **Need to buy** move an
  item, with an announcement and sensible focus.
- **Manage pantry** panel in the shopping list: add any ingredient by name, remove staples, and
  one-tap suggestions (the ingredients used by the most active recipes).
- `GET /api/pantry`, `POST /api/pantry` (idempotent) and `DELETE /api/pantry/{id}`; shopping items
  carry `in_pantry`. Migration `0006_pantry` adds the `pantryitem` table.
- Backup format **v4** adds `pantry: [{ name }]`; versions 1 to 3 still restore (empty pantry).
  `POST /api/backup/restore` also answers the number of `pantry` items.
- Pantry changes are optimistic across the pantry and every cached shopping list, are sent one
  at a time, pause offline and count in the offline banner. English and Spanish texts.

## [0.19.0] - 2026-11-20

Automatic database backups and enforced foreign keys
([ADR-0022](docs/adr/0022-automatic-backups-and-foreign-keys.md)).

### Added
- Automatic copies of the database (`cociboard.db.bak-auto-<timestamp>`): one at startup and
  then about every 24 hours, only when the data changed since the last copy. The last 7 are
  kept. Settings `COCIBOARD_BACKUP_INTERVAL_HOURS` (`0` turns them off),
  `COCIBOARD_BACKUPS_KEPT` and `COCIBOARD_BACKUP_DIR`, also passed through both compose files
  and `.env.example`. A failed copy is logged and never stops the app.
- `GET /api/backup/status`, and an "Automatic copies" section in the backup dialog (last copy,
  copies kept, the last failure, how to restore one), in English and Spanish.
- Startup integrity check: `PRAGMA quick_check` and `PRAGMA foreign_key_check`. Planned meals
  whose recipe no longer exists are removed after a `bak-integrity-` copy and logged.
- README: kinds of copies, where they live and how to restore one with Docker.

### Changed
- SQLite foreign keys are now enforced on every connection, so a planned meal can no longer
  point at a missing recipe. Migrations run with enforcement off (table rebuilds) and check
  `foreign_key_check` afterwards.
- Copies rotate per kind (automatic, schema upgrade and integrity, before a restore); file names
  of existing copies are unchanged and keep rotating.

### Fixed
- The backup dialog had no side padding and could not scroll on phones (since v0.11.0): its
  content now brings its own padding and scrolls inside the full-screen sheet.

## [0.18.1] - 2026-11-20

Safe dependency updates ([ADR-0021](docs/adr/0021-ci-before-publish.md), amendment).

### Changed
- `ci.yml` has a new `image` job that builds the amd64 image and smoke tests it on pull
  requests and branch pushes, so Dockerfile and base image changes are tested before merge.
  The smoke test is now `scripts/smoke-test.sh` (`CONTAINER_ENGINE=podman` supported), and
  the publish workflow relies on the CI call instead of building the image twice.
- Dependabot: npm and uv minor and patch updates are grouped, each major is its own pull
  request; Python base images `>=3.14` and Node major updates are ignored.
- README: architecture diagram covers the shopping, backup and auth features, the auth
  middleware, migrations and the service worker; the ADR list is complete; Node 22+ is
  stated as the requirement; new "Dependency updates" section.

## [0.18.0] - 2026-11-20

CI that gates the image ([ADR-0021](docs/adr/0021-ci-before-publish.md)).

### Added
- `.github/workflows/ci.yml` runs `make check` on pull requests, branch pushes and manually,
  and is reused by the publish workflow.
- The publish workflow now runs the checks first, verifies that a release tag matches
  `VERSION`, and smoke tests the built container (health, version, frontend) before pushing.
- `.github/dependabot.yml` with weekly grouped updates (GitHub Actions, npm, uv, Docker).

### Changed
- `make check-version` also verifies `frontend/package-lock.json` (both fields),
  `backend/uv.lock` and the README "Current version" line (script in `scripts/check-version.sh`).

## [0.17.0] - 2026-11-20

Richer recipes: steps, servings, a source link and leftovers from batch cooking
([ADR-0020](docs/adr/0020-richer-recipes.md)).

### Added
- Recipes can have **servings** (1-50), numbered **steps** (up to 50, stored as a JSON list)
  and a **source link** (`http://` or `https://` only). Migration `0005_recipe_steps_servings_source`
  adds the columns; existing recipes get no steps.
- The recipe form has a servings field, a source link field and a **steps editor** with
  Add step, Move up, Move down and Remove buttons (labelled with the step number, no dragging).
- The recipe details show "Serves N", the numbered steps and "View original recipe (host)",
  which opens in a new tab and is only rendered for safe links. Recipe cards show a compact
  servings indicator.
- **Save leftovers for the next meal** in the slot actions of a batch-cooking recipe: plans
  "Leftovers" in the next empty slot of the week with the recipe name as the note, in one
  request (English and Spanish).
- API: `servings`, `steps` and `source_url` on create, update and read; `null` clears
  `servings` and `source_url`.

### Changed
- Backup format version 3 includes the new recipe fields. Versions 1 and 2 still restore;
  an invalid `source_url` in a file is rejected as `invalid_document` before anything changes.
- The description placeholder no longer suggests putting steps or a source in it.

## [0.16.0] - 2026-11-19

Installable app with offline reading ([ADR-0019](docs/adr/0019-pwa-offline.md)).

### Added
- **Installable (PWA)**: web app manifest, app icons (plate, fork and knife; maskable and
  Apple touch variants, rendered by `frontend/scripts/render_icons.py`) and standalone display.
- **Service worker** (hand-written, no new dependency) built to `/sw.js`: precached app shell
  and assets, network-first reads of `GET /api/*` kept for offline use. Auth, backup and health
  requests are never cached; a `401` or logging out deletes the cached API data.
- **Update prompt**: a bar with a **Reload** button when a new version is ready; the page also
  checks for updates when it becomes visible again.
- **Offline banner** (English and Spanish) with the number of changes waiting to be saved,
  a "Back online" notice and a warning before leaving the page with unsaved changes. Queries
  use TanStack `offlineFirst`; changes made offline pause and resume when the connection returns.
- The backend serves `/`, `/sw.js` and `/manifest.webmanifest` with `Cache-Control: no-cache`,
  hashed assets as immutable, and `.webmanifest` as `application/manifest+json`.
- README section "Install on a phone / offline".

### Changed
- `theme-color` now matches the primary colour token (`#b9461f`).
- `npm run typecheck` also type-checks the service worker (`tsconfig.sw.json`).

## [0.15.0] - 2026-11-19

Optional household password ([ADR-0018](docs/adr/0018-optional-household-password.md)).

### Added
- **Access protection**: set `COCIBOARD_PASSWORD` (or a scrypt `COCIBOARD_PASSWORD_HASH`,
  made with `python -m cociboard.auth hash`) and the app asks for it. Nothing changes when
  neither is set.
- Login screen (bilingual, password manager friendly, show/hide toggle) and a **Log out**
  button in the header; an expired session returns to the login screen.
- Signed HTTP-only session cookie (90 days, `COCIBOARD_SESSION_DAYS`, renewed while in use,
  invalidated for everyone when the password changes). The signing key is
  `COCIBOARD_SECRET_KEY` or a generated `cociboard.secret` next to the database.
- Every `/api` route except `health` and `auth/*` requires the session (`401 auth_required`);
  unsafe requests from a foreign `Origin` are refused (`403 bad_origin`).
- Failed logins are rate limited (10 per IP and 100 overall per 15 minutes, `429`).
- `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout`.
- A dismissible warning when no password is set and the app is reached from a public address.
- `COCIBOARD_PASSWORD`, `COCIBOARD_PASSWORD_HASH` and `COCIBOARD_SECRET_KEY` in
  `.env.example` and both compose files; a "Security (password)" section in the README.

## [0.14.0] - 2026-11-19

Mobile navigation and a Today view ([ADR-0017](docs/adr/0017-mobile-navigation.md)).

### Added
- Below 900px the app shows **one view at a time** with a fixed bottom tab bar: **Today**,
  **Week**, **Recipes** and **Shopping**. The active tab has `aria-current="page"`, focus
  moves to the view's heading on change, and the toasts sit above the bar.
- **Today** view: today's and tomorrow's lunch and dinner as large cards (recipe, prep time,
  ingredients, special meal, note); tapping a recipe opens its details. It always reads the
  real current week (Sunday's tomorrow is Monday of next week), with empty and error states.
- The view is kept in the address as `?view=today|week|recipes|shopping` next to `?week=`,
  written with `replaceState` so tabs do not fill the Back history. Ignored on desktop.
- The Week tab opens scrolled to today's card (instantly with reduced motion).

### Changed
- **Add** on a recipe switches to the Week tab, where the first valid slot is brought into
  view and the select banner stays; cancelling stays on Week.
- The shopping list body is a reusable `ShoppingListView`: inline in the Shopping tab, in the
  dialog on desktop. On phones the toolbar's **Shopping list** button opens the tab.
- Desktop layout and behaviour are unchanged.

### Fixed
- Select mode now brings the first **empty** compatible slot into view, centred and above
  the tab bar, instead of the first compatible one
  ([review 0007](docs/reviews/0007-v0.14.0-review.md)).

## [0.13.0] - 2026-11-19

Special meals and slot notes ([ADR-0016](docs/adr/0016-special-slots-and-notes.md)).

### Added
- **Special meals**: a slot can be set to **Eating out**, **Leftovers** or **Free** instead of
  a recipe, from three chips above the recipe list in the slot picker. Special meals are
  planned meals: **Suggest** never fills them, they break a run of the same protein, and they
  contribute no ingredients to the shopping list. They can be dragged, swapped and removed
  like recipes.
- **Slot notes** (up to 120 characters) on recipes and special meals: **Add note** /
  **Edit note** in the slot actions, shown as a muted line in the slot and read out in its
  accessible name.
- API: `PUT .../days/{day}/{slot}` takes `{ recipe_id }` or `{ special }` (exactly one) plus
  an optional `note`; `PATCH .../days/{day}/{slot}/note`; `DayPlanRead` gains `lunch_special`,
  `dinner_special`, `lunch_note` and `dinner_note`; `PUT /api/weeks/{week_start}` (Undo) and
  Copy last week carry special meals and notes.
- Backups use **format version 2** (meals gain `special` and `note`; `recipe_ref` is optional).
  Version 1 files still restore. New restore error codes `meal_needs_recipe_or_special` and
  `note_too_long`.

### Changed
- Schema: migration `0004_slot_special_and_note` makes `mealassignment.recipe_id` nullable and
  adds `special` and `note`, with a CHECK that exactly one of `recipe_id` and `special` is set.
- `POST .../move` answers `404 "The slot is empty"` (the message no longer says "source").

### Fixed
- Slot notes wrap to two lines instead of one on narrow screens, and the keyboard
  instructions mention meals as well as recipes
  ([review 0006](docs/reviews/0006-v0.13.0-review.md)).

## [0.12.0] - 2026-11-19

Planning across weeks ([ADR-0015](docs/adr/0015-planning-across-weeks.md)).

### Added
- **Copy last week** in the planner toolbar: fills the empty slots with last week's meals
  (never overwrites, skips archived recipes), with a toast and **Undo**.
- Variety now looks at the two previous weeks: a **warning** when Monday lunch has the same
  main protein as last week's Sunday dinner, and a **tip** (score-neutral) when a recipe was
  also planned one or two weeks ago. Batch-cooking recipes are exempt from the tip.
- Suggest prefers recipes that are neither in the week nor planned recently; slot candidates
  show "Planned last week" / "Planned N weeks ago" and are never a "Good pick" then.
- API: `POST /api/weeks/{week_start}/copy` with `{ "from_week_start" }`, answering
  `{ plan, copied, skipped_archived, source_meals }`; issue kinds `previous_week_protein` and
  `recent_repeat`; candidate reason `planned_recently` (`reason_params` may now hold numbers).

### Changed
- After a plan change settles, the following two weeks are refetched so their variety stays
  correct. No schema change.
- Reviewed in [review 0005](docs/reviews/0005-v0.12.0-review.md).

## [0.11.0] - 2026-11-19

Archived recipes and exportable backups ([ADR-0014](docs/adr/0014-archive-and-backups.md)).

### Added
- **Archive recipes** instead of deleting them. An archived recipe is hidden from the
  catalogue, from suggestions and from slot pickers, but stays in the weeks where it was
  planned (marked "Archived") and still counts for variety. **Archive** / **Restore** in the
  recipe details; an **Archived (N)** list under the catalogue with **Restore**.
- Deleting a planned recipe now explains that its meals disappear from every week, past ones
  included, and offers **Archive instead** (recommended) or **Delete permanently**.
- **Backup** button in the header: download everything (recipes, plans, shopping lists) as
  one JSON file, or restore from such a file after a summary and a confirmation. Restoring
  replaces all data in one transaction.
- API: `GET /api/backup` (download), `POST /api/backup/restore` (replace all data; `422` with
  a code, `413` above 10 MB); `archived` on recipes (`PATCH`, `RecipeRead`) and
  `GET /api/recipes?archived=true`.
- Before a restore, a copy of the SQLite file is written next to it
  (`cociboard.db.bak-pre-restore-<UTC timestamp>`).
- Migration `0003_recipe_archived_at`.

### Changed
- Assigning an archived recipe to a slot answers `422` with `code: "recipe_archived"`.
  Moving or swapping meals that already use one, and Undo, keep working.
- The `409` for a duplicate recipe name now has `detail: { code: "duplicate_name", message,
  archived }` (it was a plain string); the form tells when the name belongs to an archived
  recipe.
- Backup rotation: `pre-restore` copies and migration copies are each limited to the three
  most recent (previously one shared list of migration copies).

### Fixed
- The icon-only backup button on narrow screens is a 44px touch target
  ([review 0004](docs/reviews/0004-v0.11.0-review.md)).

## [0.10.0] - 2026-11-19

Schema migrations ([ADR-0013](docs/adr/0013-schema-migrations.md)).

### Added
- Database schema changes are now versioned with Alembic and applied automatically when
  the app starts. Existing databases (v0.8.0 and v0.9.0) are upgraded in place and keep
  their data.
- Before changing an existing SQLite database, a backup is written next to it
  (`cociboard.db.bak-<previous revision>-<UTC timestamp>`); the three most recent are kept.
  README explains how to restore one.
- `make migrate` and `make migration m="message"`.
- `test_migrations.py` checks fresh, v0.8.0 and v0.9.0 databases, backups, rotation,
  downgrade and that the models match the migrations.

### Changed
- The app no longer uses `create_all` at runtime; `init_db()` runs the migrations.
- The app's own INFO logs (migrations, backup path) are printed at startup next to
  uvicorn's ([review 0003](docs/reviews/0003-v0.10.0-review.md)).

## [0.9.0] - 2026-11-19

Shopping list ([ADR-0012](docs/adr/0012-shopping-list.md)).

### Added
- **Shopping list** button in the planner toolbar: a dialog (full-screen sheet on phones)
  with the ingredients of the week's planned meals, merged by case, accents and spacing,
  each with the recipes that use it and a "×N" count for several meals.
- Tick items off (they move to "In the basket"), add items by hand, **Uncheck all**,
  **Copy** as a plain-text "- item" list and **Share** where the browser supports it.
  Ticks and manual items are stored per week on the server, so they are shared across
  devices.
- Backend: `shopping.py` (pure grouping), `shopping_repo.py`, the `ShoppingCheck` and
  `ShoppingExtra` tables (created automatically on existing databases) and the
  `/api/weeks/{week_start}/shopping-list` endpoints.
- English and Spanish strings for the whole feature.
- Review 0002 ([docs/reviews/0002-v0.9.0-review.md](docs/reviews/0002-v0.9.0-review.md)):
  shopping list changes of one week are sent to the server one at a time, in order, and
  items added in quick succession each get their own temporary id.

## [0.8.0] - 2026-10-25

Prebuilt Docker image on the GitHub Container Registry
([ADR-0011](docs/adr/0011-container-registry-image.md)).

### Added
- GitHub Actions workflow `.github/workflows/docker-publish.yml`: builds the image for
  `linux/amd64` and `linux/arm64` and pushes it to `ghcr.io/renefs/cociboard` on pushes
  to `main` (`main`), version tags (`X.Y.Z`, `X.Y`, `latest`) and by hand; every build is
  also tagged `sha-<commit>`. The package is private, like the repository.
- `docker-compose.ghcr.yml`: runs the prebuilt image without building, with the same
  settings and `./data` volume; `COCIBOARD_TAG` picks the tag (`.env.example`).
- README "Deployment (prebuilt image)" section: logging in to ghcr.io with a
  `read:packages` token, running and updating, and the Synology steps.

### Changed
- `Dockerfile`: the frontend stage runs on the build platform, so cross-platform builds
  don't emulate the npm install and Vite build.

## [0.7.0] - 2026-10-24

Docker Compose deployment ([ADR-0010](docs/adr/0010-docker-deployment.md)).

### Added
- `Dockerfile`: one multi-stage, multi-arch (amd64/arm64) image. Node builds the
  frontend, uv installs the backend, and the runtime image serves both on port 8000.
  Includes a health check on `/api/health`.
- `docker-compose.yml` with a `./data` bind mount for the SQLite database and settings
  from `.env` (`COCIBOARD_PORT`, `PUID`/`PGID`, `TZ`, `COCIBOARD_SEED_ON_STARTUP`);
  `.env.example` documents them.
- `docker/entrypoint.sh`: makes `/data` writable for `PUID:PGID` and drops root, so bind
  mounts owned by a NAS user (e.g. Synology uid 1026) work.
- Backend setting `COCIBOARD_STATIC_DIR`: when set, the app serves the built frontend at
  `/` next to the API.
- README "Deployment" section, including Synology Container Manager steps.

## [0.6.5] - 2026-10-24

### Fixed
- Recipe search ignores accents and diacritics, so "albondigas" finds "Albóndigas" and
  "pimenton" finds recipes with "Pimentón" (`q=` on `GET /api/recipes`).

## [0.6.4] - 2026-10-24

### Added
- Seed recipes "Ensaladilla rusa" (vegan, dinner, batch cooking),
  "Pimientos del piquillo rellenos" (eggs, dinner, quick), "Canelones de espinacas" (vegan, dinner, quick),
  "Pollo en pepitoria" (fish, lunch or dinner, quick) and "Pechuga de pollo a la plancha
  con tomate" (poultry, lunch or dinner, quick). The catalogue now has 33 recipes; run
  `make seed` to add them to an existing database.

## [0.6.3] - 2026-10-24

### Added
- Seed recipes "Porrusalda" (meat, lunch, batch cooking), "Marmitako" (fish,
  lunch, quick) and "Croquetas de jamón" (meat, dinner, quick). The catalogue now has 28 recipes;
  run `make seed` to add them to an existing database.

## [0.6.2] - 2026-10-24

### Added
- Seed recipe "Migas" (meat, lunch or dinner,
  kid-friendly, batch cooking). The catalogue now has 25 recipes; run `make seed` to add
  it to an existing database.

## [0.6.1] - 2026-10-24

### Fixed
- Backend: the `lifespan` startup function in `main.py` is annotated as
  `AsyncGenerator[None, None]` instead of `AsyncIterator[None]`. Recent type stubs (as
  bundled with Pylance) deprecate the `AsyncIterator` return annotation on
  `@asynccontextmanager` functions. No behaviour change.

## [0.6.0] - 2026-10-24

Spanish interface with browser language detection ([ADR-0009](docs/adr/0009-internationalisation.md)).

### Added
- Spanish (Spain) and English interface, built on react-i18next with typed catalogues
  (`frontend/src/i18n/locales`): a missing or extra Spanish key is a compile error. Recipe
  names, ingredients and descriptions are not translated.
- Language detection: saved choice (`localStorage` `cociboard.language`), then the browser
  languages (any `es-*` gives Spanish), then English. `<html lang>` follows the active language.
- An **EN | ES | Auto** switcher in the app header; Auto forgets the saved choice.
- Locale-aware dates and weekday names (Spanish "lunes", "26 oct"), cached per locale.
- Backend: variety issues carry `params` and slot candidates carry `reason_code`
  (`CandidateReason`) and `reason_params`, so the frontend can translate them. The English
  `message` and `reason` are kept.
- `AGENTS.md`: tool-neutral instructions for AI coding agents (commands, layout,
  conventions, UX and release rules), including the new i18n rule. `CLAUDE.md` now imports it.

### Changed
- Screen-reader announcements for drag and drop, toasts, validation and error messages are
  translated; server validation messages are no longer shown, each form field gets its own
  translated message instead.
- Plurals use proper plural rules per language instead of appending "s".
- Slot sentences are written whole per language ("Add lunch" / "Añadir comida") instead of
  interpolating the raw `lunch` / `dinner` value.
- A variety issue's identity (for highlighting) is built from its kind and slots instead of
  its English message.
- The duplicated "Lunch" / "Dinner" labels now come from one catalogue key.

## [0.5.1] - 2026-10-24

Fixes from [review 0001](docs/reviews/0001-v0.5.0-review.md).

### Fixed
- Plan requests of one week are now sent one at a time in call order (FIFO per week) while
  optimistic updates stay immediate, so quick consecutive changes no longer race and cause
  spurious 404/500 errors, rollbacks or flicker (review finding 1).
- A unique-constraint violation on a slot (for example a concurrent write from a second tab)
  in assign, move, suggest and replace now answers `409` ("The plan changed meanwhile; reload
  and try again") instead of 500, after rolling the session back. The UI shows the same
  message and refetches (review finding 2).
- `update_recipe` compares meal types with `!=` instead of `is not` (review finding 3).

## [0.5.0] - 2026-10-24

### Added
- Recipe management in the UI: **New recipe** and **Edit** in a validated form (name 1-80,
  meal type as a segmented control with icons, main protein select with icons, prep minutes,
  description, ingredient rows with add/remove, Enter-for-new-row and multi-line paste
  splitting, property toggle chips). Inline errors; a duplicate name (409) is shown on the
  name field and 422 responses are mapped to fields. The form is a full-screen sheet on phones.
- Recipe details modal (ingredients, description, labelled properties, prep time, protein)
  reachable from recipe cards and from a planned slot's **View details**, with **Edit** and
  **Delete**. Delete asks for confirmation and shows how many planned meals use the recipe.
- `GET /api/recipes/{id}/usage` returns `{ count }` of planned slots using a recipe.
- Changing a recipe's meal type so that it no longer fits planned slots answers `409` with a
  structured `detail` listing `{ week_start, day, slot }`; `PATCH ...?force=true` removes those
  planned meals and applies the change. The form lists the meals and offers "Remove them and save".
- Loading skeletons for the recipe list and week grid; offline/error states with **Retry**;
  empty states ("Clear filters" when nothing matches, "Add your first recipe" for an empty catalogue).
- ADR-0008 (recipe edits versus planned meals), README architecture diagram (Mermaid) and a
  "How to plan a week" guide.

### Changed
- Accessibility: toasts are announced through an always-mounted `aria-live` region, form
  controls have programmatic labels, errors and descriptions are linked with `aria-describedby`,
  focus is kept visible on every control (including the segmented meal type), placeholders and
  badge/accent colours were darkened to reach WCAG AA contrast (a unit test guards the palette),
  and animations (sheets, skeleton shimmer, smooth scrolling) honour `prefers-reduced-motion`.
- Modals render in a portal on `document.body`; forms do not close on a backdrop click so typed
  input is not lost by accident.
- `ApiError` carries the response `detail`; `updateRecipe` takes an optional `force` flag.

## [0.4.0] - 2026-10-24

### Added
- Variety analysis (`variety.py`, pure and unit-tested): repeated recipes (info for batch
  cooking), the same main protein in consecutive meals, one protein in more than four meals,
  too few vegetable-forward meals and too little fish. A 0-100 score (`null` for an empty
  plan). `GET /api/weeks/{week_start}/variety`, and `variety` in every week plan response.
- Suggestions (`suggest.py`): `POST /api/weeks/{week_start}/suggest` fills only empty slots
  with compatible recipes, greedily maximising the variety score and avoiding repeats
  (optional `seed` for repeatable results). `GET .../days/{day}/{slot}/candidates` ranks the
  compatible recipes with `score_delta`, a short `reason` and `good_pick`.
- `DELETE /api/weeks/{week_start}` clears a week; `PUT /api/weeks/{week_start}` replaces a
  week atomically (used by Undo).
- Week navigation in the planner header (previous, This week, next, date range), the week in
  the URL (`?week=YYYY-MM-DD`, Back and Forward work) and prefetching of neighbouring weeks.
- Toolbar with Suggest and Clear week (confirmation dialog); both offer Undo in a toast.
- Variety summary: colour-coded score badge, expandable issue list (click an issue to
  highlight its slots), warning markers with accessible text on affected slots and a
  per-protein count.
- Recipe panel: "×N this week" usage badges and a "Best for variety" sort.
- Tap-to-assign picker ranked by variety, with the reason as a hint and "Good pick" marks.
- `COCIBOARD_API_URL` overrides the API target of the Vite dev proxy.
- ADR-0007 (variety rules, scoring and suggestions).

### Changed
- Recipe names in slots no longer break mid-word: automatic hyphenation, three-line clamp and
  the full name as tooltip; in the seven-column grid the remove button moved above the name
  so names get the full column width.
- The planner header shows a compact date range ("26 Oct – 1 Nov 2026").
- The picker loads its recipes from the candidates endpoint instead of the full catalogue.

## [0.3.0] - 2026-10-24

### Added
- Weekly planner: a 7-day grid with lunch and dinner slots. Day columns on wide screens,
  a list of day cards on tablets and phones; today is highlighted.
- Drag and drop with @dnd-kit (mouse, press-and-hold touch and keyboard): drag recipes from
  the panel into slots, move or swap assigned recipes between slots, drop an assigned
  recipe on the recipe list to remove it. Compatible slots highlight; incompatible slots
  are dimmed with a "Not for lunch/dinner" hint and refuse the drop. Screen-reader
  announcements in English.
- Tap-to-assign: slot picker (bottom sheet on mobile, dialog on desktop) with search that
  lists only compatible recipes, actions for filled slots (Replace, Remove, View details)
  and a select mode started from a recipe's Add button.
- Compact recipe cards for the panel with a one-line ingredient summary that expands.
- Optimistic updates with rollback and an error message when saving fails.
- Backend: `MealAssignment` model, `week_start_for` and validation helpers, and
  `/api/weeks` routes (`current`, get, assign, clear, move/swap) with full tests. Deleting
  a recipe removes its assignments.
- ADR-0005 (planner interaction design) and ADR-0006 (week plan data model).

### Changed
- The recipe panel renders the compact card inside the planner; the app layout moved to a
  planner-first grid.
- Version bumped to 0.3.0.

## [0.2.0] - 2026-10-24

### Added
- Recipe domain: `MealType` (lunch, dinner, both), `MealSlot`, `Protein`, `RecipeProperty`
  and the pure, unit-tested `fits_slot` rule.
- SQLite persistence with SQLModel (JSON columns for ingredients and properties) and
  separate API schemas with validation.
- CRUD API under `/api/recipes` with `slot`, `q` and repeated `property` filters and
  404 / 409 / 422 handling.
- Idempotent seed of 24 Spanish/Mediterranean-friendly recipes, run on startup when the
  database is empty (`COCIBOARD_SEED_ON_STARTUP`) and via `make seed`.
- Frontend recipe panel: search, All / Lunch / Dinner chips, property filter, recipe cards
  with collapsible ingredients, labelled property icons and a legend.
- TanStack Query for data fetching; responsive layout with a recipe sidebar from 900px and a
  placeholder for the weekly planner.
- ADR-0003 (recipe data model) and ADR-0004 (TanStack Query and icons).

### Changed
- Version bumped to 0.2.0.

## [0.1.0] - 2026-10-24

### Added
- Monorepo scaffold with `backend/` (FastAPI, uv) and `frontend/` (React 18, TypeScript, Vite).
- `GET /api/health` endpoint returning status and version.
- Frontend app shell with header and a footer showing the backend version, with an offline fallback.
- Typed API client, design tokens (CSS custom properties) and a mobile-first layout.
- Tooling: ruff, mypy (strict), pytest, ESLint, `tsc --noEmit` (strict), Vitest.
- Makefile (`install`, `dev`, `test`, `lint`, `typecheck`, `check-version`, `check`).
- README, ADR-0001 (tech stack) and ADR-0002 (versioning and change log).
