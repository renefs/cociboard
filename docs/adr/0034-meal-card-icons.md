# ADR-0034: Protein and property icons on the week's meal cards

## Status
Accepted. Amends ADR-0032 (the slot cards' meta line).

## Context
ADR-0032 replaced the emoji strings on the week's meal cards with a quiet meta line: a protein
colour dot with its short name and the prep time. The owner missed the icons: at a glance the
week no longer showed which meals are vegetarian, quick, spicy, light and so on, and a colour
dot is harder to read as a protein than its icon. On the phone list the dot sat to the right
of the name.

## Decision
- The meta line of a planned recipe shows the protein's icon (decorative, `aria-hidden`, since
  the protein's name follows it), its short name, the prep time and then the property icons
  from `PROPERTY_META`, each a `MetaIcon` with its accessible name. The meal-type icon is not
  shown: the slot already says lunch or dinner.
- The icons are drawn at the meta text size (0.875rem) so the line stays one row high on
  desktop; when a card is narrow, the property icons wrap onto a second line.
- In the compact list (phones and windows under about 1190px) the meta line moves under the
  name, which now takes the whole width; the protein name and time stay visually hidden there,
  as before. Each meal line is still at least 44px tall and about four days fit on a 375px
  screen.
- The icons stay under the slot button's stretched `::after`, so a tap anywhere on the card
  still opens its actions; the property names therefore have no hover tooltip on the card (they
  do in the recipe details).
- The protein dot stays in the recipe rows and the variety panel, where its colour links to
  the variety bar.

## Consequences
- The week shows the same at-a-glance information as before the refresh, in a single line per
  card instead of a row of badges.
- Phone meal lines are a little taller when they have icons; the E2E check that four days fit
  still passes.
