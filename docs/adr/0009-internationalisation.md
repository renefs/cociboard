# ADR-0009: Internationalisation

## Status
Accepted

## Context
The interface was English only, but the starter recipes are Spanish and so are many of
the people who will use the app. v0.6.0 adds a Spanish (Spain) interface next to English.
Requirements: follow the browser language automatically, let the user override it, remember
the override, and never translate recipe content (names, ingredients and descriptions stay
as the user wrote them, including the Spanish seed).

Some user-visible text used to be produced outside React components: the dnd-kit screen
reader announcements, error and toast messages, and, in the backend, the variety messages
and the reasons shown in the slot picker. Several sentences were assembled from fragments
(for example `"Not for " + slot`), which cannot be translated correctly.

## Decision
- **react-i18next with bundled catalogues.** `i18next`, `react-i18next` and
  `i18next-browser-languagedetector`. Both languages ship in the JS bundle (they are small),
  so there is no loading state and no flash of the wrong language. Other libraries (for
  example FormatJS) were considered; i18next is the most widespread choice, has built-in
  plural rules through `Intl.PluralRules`, and needs no build step.
- **Typed catalogues.** `src/i18n/locales/en.ts` is the source of truth (`as const`);
  `es.ts` is declared `satisfies Translation`, derived from it, so a missing or extra key is
  a compile error. `i18next.d.ts` types `t("…")` keys. A unit test also compares the key
  sets and placeholders at runtime, which covers plural variants.
- **Detection order:** saved preference (`localStorage["cociboard.language"]`), then
  `navigator.languages` (any `es-*` gives Spanish), then English. The preference is per
  device because the app has no accounts. The detector is configured not to cache: only an
  explicit choice in the header switcher (**EN | ES | Auto**) writes the key, and **Auto**
  removes it. Letting the detector cache would turn the detected language into a saved
  preference and make "Auto" meaningless.
- **Whole sentences per key.** No concatenating fragments. Sentences that name a meal slot
  have `lunch` and `dinner` variants (Spanish needs "la comida" / "la cena" and "del
  lunes"), plurals use `_one` / `_other`, and rich text uses `<Trans>`. Spanish says
  "comida" for lunch and "cena" for dinner.
- **Pure modules take `t` and a locale.** Functions that return text (`describeSlot`,
  `describePlanError`, the drag announcements, validation and conflict messages) receive a
  `TFunction` and, where dates are involved, the language code, so they stay pure and
  testable in both languages. Components get both from hooks (`useTranslation`, `useLocale`).
- **Locale-aware dates.** `weekMath.ts` formats dates and weekday names with `Intl.DateTimeFormat`
  cached per locale (English keeps the UK day-first format). Weekday names come from `Intl`
  and are capitalised for headings.
- **The frontend owns all wording; the backend sends codes and params.** The variety issues
  carry `kind` plus `params` (recipe name, count, protein as an enum value, slot positions
  as `{ day, slot }`), and slot candidates carry `reason_code` (a `CandidateReason` enum)
  plus `reason_params`. The English `message` and `reason` remain for API consumers and
  logs, documented as not localised. The alternative, translating on the server from
  `Accept-Language`, would split the wording between two codebases and make the pure
  backend modules depend on a catalogue. Issue identity in the UI (highlighting) is built
  from `kind` and slots, not from the message text.
- **Server validation text is never shown.** 422 errors are mapped to the client's own
  translated message per field (falling back to a generic "invalid value").
- **Recipe content is not translated.** Names, ingredients and descriptions are data. The
  recipe name keeps `lang="es"` for hyphenation, which is about the data, not the UI.
- **`<html lang>`** follows the active language at runtime.

## Consequences
- Adding a language means one new catalogue file (typed against `en`), an entry in
  `LANGUAGES` and `resources`, a mapping in `weekMath.ts`, and a switcher button.
- Every new user-visible string needs a key in both catalogues; TypeScript enforces it.
- Components and tests rely on the global i18n instance, so tests run without a provider and
  `test/setup.ts` forces English before each test.
- The preference is not shared between devices.
- Machine-readable `params` are now part of the API contract of the variety and candidates
  endpoints.
