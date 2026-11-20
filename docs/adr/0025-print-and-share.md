# ADR-0025: Print and share

## Status
Accepted

## Context
A menu is most useful away from the screen: stuck on the fridge, sent to the family chat, in
the calendar. The shopping list already had Copy and Share, but nothing printed, the week menu
could not leave the app at all, and the clipboard API only exists in secure contexts, which a
home server reached over plain http on the LAN is not (the Share/Copy buttons failed there with
an error toast). The server has no notion of who is calling a calendar app, and the app is
single-password.

## Decision
- **Print through a portal and a print stylesheet.** `PrintWeek` and `PrintShopping` render into
  a `.print-root` element (a child of `<body>`) through a portal; `window.print()` is called one
  animation frame later and the content is removed on `afterprint`. `styles/print.css` hides
  every other child of the body (the app, dialogs and toasts) and forces black on white, A4
  portrait, no backgrounds, `break-inside: avoid` per day. No separate print route and no PDF
  library: the browser's own "Save as PDF" covers PDFs, nothing is added to the bundle, and the
  printout always matches the data on screen (it reads the same cached plan and list).
- **Share, else copy, else show.** `shareOrCopy` uses `navigator.share` when present (a dismissed
  sheet is "cancelled", any other failure falls through), then `navigator.clipboard.writeText`,
  and finally answers "manual": the caller opens a dialog with a read-only, pre-selected
  textarea. Every call site handles all four outcomes the same way (`useShareText`): a toast for
  "copied", the dialog for "manual", nothing otherwise. The label says Share or Copy according to
  what the browser can do.
- **Calendar export is client-side `.ics` with floating times and stable UIDs.** `weekAsIcs` is
  a pure function producing RFC 5545 text (CRLF, lines folded at 75 UTF-8 octets without splitting
  a character, TEXT escaping). Events use floating local times (no TZID, no Z), so a meal at
  14:00 stays at 14:00 wherever the calendar is, and a fixed one-hour slot (lunch 14:00, dinner
  21:00, typical in Spain). The UID is `<date>-<slot>@cociboard`, so importing a later export
  updates the events instead of duplicating them. On touch devices that can share files the file
  goes to the share sheet (how iOS and Android reach the calendar app); elsewhere it downloads.
- **No calendar feed.** A subscription URL would have to be fetched by the calendar app without
  the session cookie, so it would need a token in the URL: a second way into the data that the
  single-password model avoids. An export the user triggers is simpler and has no such exposure.
- The share menu is a disclosure (a button with `aria-expanded` and `aria-controls` opening a
  list of buttons), not an ARIA menu: Escape, an outside click or tabbing away closes it,
  focus returns to the trigger, and its position is clamped to the viewport at 375px.

## Consequences
- Frontend only: no API, schema or migration change.
- Printing depends on the browser's print preview; there is no server-side PDF, and Safari on
  iOS may not fire `afterprint` promptly (the printout then stays mounted, but hidden, until the next print replaces it).
- Calendar events are a snapshot. Changing a meal and exporting again updates the same events,
  but a meal that was removed leaves its old event behind in the calendar.
- Re-importing into some calendars may ask whether to replace events; floating times are shown
  in the calendar's own time zone.
- Text exports include the pantry line of `shoppingListText` ("Also check at home: ...").
