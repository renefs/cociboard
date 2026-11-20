# ADR-0028: End-to-end tests

## Status
Accepted

## Context
Vitest (jsdom) and pytest cover the rules and the components, but nothing exercised the
assembled app: the built frontend talking to the real API and a real SQLite file, a real
pointer drag (jsdom can't do dnd-kit drags, see AGENTS.md), the phone layout, the service
worker, the sign-in page or the accessibility of the pages as rendered. Each of those has
broken in other projects without any unit test noticing, and the release gate (ADR-0021) only
proved that the image starts.

## Decision
- **Playwright with Chromium only** (`@playwright/test`, plus `@axe-core/playwright`). One
  engine keeps the suite fast and the CI cache small; the app uses no engine-specific
  features, and the household runs it from whatever browser they like, so cross-browser
  coverage is not worth the minutes. WebKit and Firefox can be added as projects later.
- **The built app served by the backend.** `playwright.config.ts` starts
  `uvicorn cociboard.main:app` with `COCIBOARD_STATIC_DIR` pointing at `frontend/dist`: the
  same single-origin setup as the Docker image (ADR-0010), without needing Docker, and the
  production service worker is the one under test. A second backend (port 8767) has
  `COCIBOARD_PASSWORD` set for the sign-in spec. Ports default to 8766 and 8767 (not the dev
  ports 8000 and 5173) and can be overridden with `COCIBOARD_E2E_PORT` and
  `COCIBOARD_E2E_AUTH_PORT`. Each server gets its own database under the OS temp directory,
  wiped when it starts and removed in `globalTeardown`; seeding and the nightly copies are
  turned off, and so is "import from a link", so the suite never touches the network. Servers
  and browser both run in `Europe/Madrid` so "today" is the same on both sides.
- **The config never builds.** `make e2e` and `npm run e2e` run `npm run build` first, and so
  does the CI job; running `npx playwright test` after changing the app needs a rebuild. This
  keeps single-spec runs fast and makes it obvious which build is under test.
- **Two projects, one spec set.** `desktop` (Desktop Chrome at 1440×900) and `phone`
  (Chromium at 375×812, `isMobile`, `hasTouch`). Files named `*.desktop.spec.ts` or
  `*.phone.spec.ts` run in one project only (mouse drags, keyboard drag and drop and the
  offline spec on a desktop; the tab bar, slot picker and Today view on a phone); the rest run
  in both and branch on the `isMobile` fixture where the layouts differ (the recipe list and
  the shopping list are tabs on a phone, a side panel and a dialog on a desktop).
- **Isolation: restore a known document before every test, one worker.** All tests share one
  database per server, so `workers: 1` and an automatic fixture that restores a fixed backup
  document (`e2e/data.ts`: fourteen recipes, no plan, default preferences) through
  `POST /api/backup/restore` before each test. The restore is the app's own full, transactional
  replacement (recipes, plans, shopping lists, pantry and settings), so no test-only endpoint
  or database hack is needed, and it exercises the backup path as a side effect. A spec can
  restore a different document (a plan, a pantry, an archived recipe). Because the app saves
  optimistically, a test can end while its last change is still on the way, so the browser
  fixture waits until the page has no API request in flight before the next test starts;
  without it a late PUT landed after the next test's reset. Parallelism would need one
  database per worker; with a suite this short it is not worth the extra servers.
- **Locators and language.** Role and label locators only (`getByRole`, `getByLabel`); the app
  is fully labelled, so a missing accessible name is a test failure too. The UI runs in English
  (the fixture writes the language preference into localStorage, as the switcher does); the
  language spec switches to Spanish and a second one starts in Spanish. Dates are derived from
  the same "today" as the server, never hard-coded.
- **Service worker off, except once.** `serviceWorkers: "block"` by default, because the worker
  caches API reads across tests. The offline spec allows it, waits for it to control the page,
  goes offline, edits the plan, checks the offline banner and the queued change, goes back
  online and checks the change reached the server.
- **Accessibility scans.** `@axe-core/playwright` with the WCAG 2.0/2.1 A and AA tags on the
  desktop view, the phone Today/Week/Recipes/Shopping views, the archived list and the dialogs
  (recipe form with errors, slot picker, recipe details, household preferences). It fails on
  `serious` and `critical` violations and lists them. The scans run with reduced motion,
  because dialogs fade in and axe would measure the colours of a half-transparent dialog; no
  rule is disabled.
- **Timing.** Playwright's retries are 2 in CI and 0 locally, with a trace on the first retry,
  the HTML report in CI only and `forbidOnly` in CI. `actionTimeout` is 10 s so a stuck action
  names its line.
- **Not in `make check`, required in CI.** The suite needs a browser and a production build,
  which would slow the inner loop every commit goes through. It has its own job in `ci.yml`,
  and because `docker-publish.yml` calls that whole workflow (`needs: check` waits for every
  job of the called workflow), a failing E2E run blocks publishing (ADR-0021). The job caches
  `~/.cache/ms-playwright` by the Playwright version in `package-lock.json`, always installs
  the system libraries, and uploads the report and traces for 7 days when it fails.
- **Typing and linting.** E2E code has its own `tsconfig.e2e.json` (Node types, part of
  `npm run typecheck`), is linted with the rest, and is excluded from Vitest.

## Consequences
- UI flows, the phone layout, drags, the keyboard path, sign-in, offline and accessibility are
  now checked on the built app; a regression there fails the pull request.
- The first axe scan found two real violations (WCAG 2.5.3, Label in Name): the accessible
  names of the variety badge and of slots with a note or an archived recipe did not contain
  their visible text. They are fixed in the same change.
- Contributors need `npx playwright install chromium` once, and a build before a single-spec
  run. The suite takes under a minute locally; CI adds the browser download (cached).
- A test is slower than a unit test and shares state through one database, so tests must stay
  independent of order and the data reset must stay cheap (a restore of a few rows).
- Chromium only: an engine-specific bug (Safari drag handling, say) is not caught.
- Playwright and axe majors are rare; their minor and patch updates arrive in the usual
  grouped Dependabot pull request, which runs this suite.
