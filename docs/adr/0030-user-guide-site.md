# ADR-0030: User guide on GitHub Pages

## Status
Accepted

## Context
The README is a complete reference, but it is written for whoever installs and develops
Cociboard: deployment, environment variables, the API. The people who plan the menus had no
guide of their own, nothing with pictures, and nothing in Spanish although the interface is
bilingual. The guide had to be easy to follow, show every feature with screenshots, and stay
correct as the UI changes.

Two places were considered:

- **The GitHub wiki.** Quick to start, but it lives in a separate repository, is edited outside
  pull requests (no review, no CI, no link check), has no real navigation, search or language
  switcher, and screenshots have to be uploaded by hand. Like the code, it is only visible to
  people with access to the private repository.
- **A static site on GitHub Pages**, built from files in this repository.

## Decision
- **A MkDocs site with the Material theme in `userguide/`**, published to GitHub Pages by
  `.github/workflows/userguide.yml` on every push to `main` that touches it (pull requests only
  build it). The guide is versioned, reviewed and released with the code it describes, and gets
  search, navigation, dark mode and a mobile layout for free. The versions are pinned in
  `userguide/requirements.txt` and updated by Dependabot.
- **English and Spanish** with `mkdocs-static-i18n` (`docs/en/`, `docs/es/`, one switcher).
  The Spanish text uses the exact labels of the Spanish interface.
- **Generated screenshots.** `make docs-screenshots` runs a separate Playwright config
  (`frontend/playwright.userguide.config.ts`, files in `frontend/userguide/`) against the built
  app with the starter recipes, puts a demo week in place through the API and writes every
  picture in both languages, desktop (1440×900) and phone (375×812 at 2x). Locators read the
  labels from the app's own catalogues (`en.ts`, `es.ts`), so the same script serves both
  languages. Pictures are committed, so the Pages build needs only Python.
- `mkdocs build --strict` with link and anchor validation fails on any broken link, anchor or
  image, in CI and in `make docs`.
- The README stays the reference for administrators and developers; the guide has one short
  "Installing Cociboard" page and links to the README for the rest.

## Consequences
- After a UI change the guide shows, the pages and the pictures must be updated
  (`make docs-screenshots`); AGENTS.md says so. Pictures show the week they were taken in.
- About 4 MB of PNG files live in the repository and grow when they are regenerated.
- **GitHub Pages on a private repository needs a paid plan (GitHub Pro or a Team plan), and the
  site itself is public** (only GitHub Enterprise Cloud offers private Pages). It contains no
  household data: only the demo recipes and the guide text. Pages must be enabled once in the
  repository settings (Settings → Pages → Source: GitHub Actions).
- Material for MkDocs is in maintenance mode and MkDocs 2 will not be compatible with it; its
  authors' successor, Zensical, reads the same `mkdocs.yml`. Moving is a later change, once it
  supports the i18n plugin's features.
