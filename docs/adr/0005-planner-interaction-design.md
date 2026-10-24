# ADR-0005: Planner interaction design

## Status
Accepted

## Context
The planner is the core of the product and must be fast to use on a phone as well as on a
desktop. Drag and drop is natural with a mouse but unreliable on touch screens (it
competes with scrolling) and unusable for keyboard and screen-reader users. Slots also
have a compatibility rule (`fits_slot`): a dinner-only recipe cannot go into a lunch slot.

## Decision
- **@dnd-kit/core** provides drag and drop. It is headless, supports pointer, touch and
  keyboard input, ships screen-reader announcements and works with plain React state.
  `@dnd-kit/sortable` is not needed: slots are fixed drop targets, not a reorderable list.
- **Three sensors.**
  - A `PointerSensor` subclass for mouse and pen with distance activation (6 px), so a
    plain click still activates buttons. It ignores touch pointers.
  - `TouchSensor` with a 200 ms press delay and 5 px tolerance, so a normal swipe scrolls
    the page and only press-and-hold starts a drag.
  - `KeyboardSensor` with Space to pick up and drop, Escape to cancel, and a custom
    coordinate getter that jumps to the nearest enabled drop target in the arrow-key
    direction (pure geometry in `keyboardNavigation.ts`). Enter is left free so it can
    open the slot actions.
- **Drag sources:** recipe cards in the panel (assign) and assigned recipes in slots
  (move, or swap when the target is occupied). **Drop targets:** the 14 slots and the
  recipe panel, which removes a recipe dragged out of a slot.
- **Compatibility is visible while dragging.** Compatible slots are highlighted, the
  hovered one more strongly. Incompatible slots are dimmed, show "Not for lunch/dinner"
  and are disabled as droppables, so they refuse the drop and are skipped by keyboard
  navigation. The same rule drives the tap flows.
- **Tap-to-assign is a first-class alternative, not a fallback.** Tapping an empty slot
  opens a picker (bottom sheet below 900 px, centred dialog above) listing only the
  recipes that fit, with instant search. Tapping a filled slot offers Replace, Remove and
  View details. A recipe card's "Add" button enters select mode: compatible slots are
  highlighted (empty ones pulse), a sticky banner offers Cancel, Escape exits, the first
  target is scrolled into view, and tapping a slot places the recipe. Every drag and drop
  operation therefore has a tap or keyboard equivalent (see CLAUDE.md).
- **Pure logic is separated from components.** `fitsSlot` and recipe filtering
  (`slots.ts`), optimistic plan transforms (`planTransforms.ts`), week date math
  (`weekMath.ts`) and the drop decision `resolveDrop`/`handleDragEnd` plus the English
  announcements (`dragLogic.ts`) are plain functions with unit tests. dnd-kit event
  handlers only translate events into those inputs, because simulating pointer drags in
  jsdom is unreliable.
- **Optimistic updates with TanStack Query.** Assign, remove and move update the cached
  week immediately using the pure transforms. On failure the cache is rolled back to the
  snapshot taken before the change and a toast explains what happened. The week is
  refetched once the last in-flight change settles, so overlapping responses cannot
  overwrite newer optimistic state. The server stays the source of truth: it validates
  compatibility again and returns `422` for an invalid change.
- **Responsive layout** uses a container query on the planner: seven day columns with
  aligned lunch and dinner rows when the planner is at least 52 rem wide, otherwise a
  vertical list of day cards (two columns from 40 rem, lunch and dinner side by side when
  a card is wide enough). The recipe sidebar is shown to the left from 900 px and its width
  scales with the viewport. A container query is used rather than a viewport breakpoint
  because the available width depends on the sidebar.

## Consequences
- Touch users can plan without ever dragging; mouse users get immediate drags; keyboard
  users get Space/arrow dragging and Enter for actions.
- Two input paths per action mean more UI states to maintain; the shared pure rules keep
  them consistent.
- Laptops between 900 and about 1250 px wide show the day-card list instead of seven
  columns, trading the weekly overview for readable slots.
- Keyboard dragging and real touch gestures are covered by design and by unit tests of the
  logic, not by automated gesture tests.
