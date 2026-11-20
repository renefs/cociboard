# ADR-0029: Persisted offline edits

## Status
Accepted

## Context
ADR-0019 made the app usable offline: the service worker answers API reads from its cache, and
mutations (default network mode) pause in memory until the connection returns. Closing the tab,
reloading it, or the phone killing the PWA lost every waiting change. The waiting changes are the
optimistic mutations: plan changes (`week-change`), shopping ticks and extras (`shopping-change`),
pantry (`pantry-change`), household settings (`household-change`) and favourites
(`favourite-change`).

Three things have to hold after a restart: the waiting changes must exist (stored), the UI must
look as the user left it (the queries are refetched or served by the service worker and know
nothing about them), and they must reach the server in the original order, once.

## Decision
- **Persist mutations with TanStack's persister.** `persistQueryClient` from
  `@tanstack/react-query-persist-client`, with `shouldDehydrateMutation` restricted to pending
  mutations of the five keys above. **Queries are not persisted:** the service worker already keeps
  the last API reads (and removes them at logout), a second copy in the page would be bigger, could
  disagree with it and would need its own age and privacy handling, and the overlay below makes the
  displayed data correct whatever base data arrives.
- **Restored mutations get their functions from defaults.** `registerMutationDefaults`
  (`src/offline/defaults.ts`) calls `setMutationDefaults` per key with the `mutationFn` and the
  `onSuccess` / `onError` / `onSettled` behaviour. The hooks only add `mutationKey`, `scope` and
  their own `onError` (which, as an observer option, overrides the default one: the toast of the
  page that made the change). Variables are plain JSON and carry everything the request needs
  (`{ weekStart, change }` for plan and shopping; the plan `assign` change holds the whole
  `Recipe`, a few hundred bytes). After the restore `resumePausedMutations()` runs.
- **Overlay, not `setQueryData` in `onMutate`.** The cache holds the last server state. Every
  read (`useWeekPlan`, `useShoppingList`, `usePantry`, `useHouseholdSettings`, `useRecipes`, plus
  `readWeek` for imperative reads) lays the pending mutations over it, oldest first, with pure
  functions (`applyPlanChanges`, `applyShoppingOverlay`, `applyPantryChanges`,
  `applyHouseholdSaves`, `applyFavouriteToggles`). `usePendingVariables` reads them with
  `useMutationState`. One mechanism covers a change made in this page and a restored one, nothing
  can be applied twice (the cache never contains pending changes), and a failed change needs no
  rollback: it stops being pending and so stops being overlaid. When a request succeeds, its
  `onSuccess` writes the server's answer (or, for pantry and favourites, the same change) into the
  cache so the change does not blink out between "no longer pending" and the refetch; the refetch
  still runs once the last change of its group settles. Known residual: a refetch that lands while a
  request is in flight can already contain that change, and a non-idempotent change (a move) is
  then overlaid once more until the settle refetch corrects it.
- **Ordering with `scope`.** TanStack runs mutations of one scope one at a time, in creation
  order, including restored and resumed ones, and continues after a failure. Plan changes use
  scope `week-<weekStart>` (replacing the module-level `sendInOrder` chain, which a reload would
  lose); shopping `shopping-<weekStart>`, pantry `pantry`, household `household`, favourites
  `recipe-favourite`, as before. Restored mutations are hydrated in stored order and
  `resumePausedMutations` continues them one after the other.
- **Storage: `localStorage`.** The payload is a few kilobytes of JSON; `localStorage` is
  synchronous (the restore finishes before the first paint, so there is no flash of unmodified
  data), needs no dependency and is available everywhere the app runs. IndexedDB would only pay off
  for large data. Every call is wrapped: a blocked, full or corrupted store means no persistence
  (the changes still wait in memory), never an error. Writes are throttled (250 ms, last state
  wins) and flushed on `pagehide` and when the page becomes hidden, because a phone may kill a
  hidden PWA without further notice.
- **Versioning and age.** The stored envelope is `{ version, savedAt, client }`. `FORMAT_VERSION`
  (currently 1) is independent of the app version, so an app update never drops waiting changes;
  it is bumped only when the stored shape or the variables of a mutation change incompatibly, and
  data of any other version is discarded. Data whose last write is older than 7 days is
  discarded too (they would be applied to a week the user has long forgotten). Both cases show a
  dismissible notice with the number of changes thrown away; corrupted data is dropped silently.
- **Failures on resume.** A change the server rejects (409/422, archived recipe) fails like
  today: the overlay disappears (rollback), and since the page that made it may be gone an error
  notice in the banner area explains it (the default `onError`). A `401 auth_required` does not
  fail the mutation: `retryAfterSignIn` keeps it pending (so stored) while the API client has
  already shown the login screen, and the login screen releases it after a successful sign-in,
  which sends the request again. `markSignedOut` leaves the mutation cache alone.
- **Privacy and consistency.** Logging out and a backup restore call `discardWaitingEdits`: the
  waiting changes are removed from the mutation cache and from storage (the next person on a
  shared device must not inherit them; after a restore they refer to replaced data). A request
  already on its way cannot be recalled.
- **One tab sends.** Two tabs restoring the same stored changes would send them twice. Only the
  tab holding a Web Lock (`navigator.locks.request("cociboard-offline-edits")`, held for the life
  of the tab) restores, sends and stores; others queue for the lock and take over (restoring then)
  when the leader closes. Without the Web Locks API every tab leads, as before. Consequence: a
  change made offline in a non-leader tab is held in memory only until that tab becomes leader.
- **In flight at close.** A mutation that was being sent when the page closed is stored as
  running and restored as paused, so it is sent again. That is at-least-once delivery: harmless for
  every change here (setting a value, placing, clearing, moving an already moved slot is a no-op or
  rejected) except adding a shopping extra or pantry staple by name, which can appear twice.
- The unload warning stays: changes wait on the device but have not reached the server, and a
  closed tab cannot send them.

## Consequences
- Each new optimistic mutation must register defaults, a key in `offline/keys.ts`, JSON variables,
  and an overlay in its read hook; tests build clients with `makeTestQueryClient`.
- Component tests no longer see optimistic data in the cache (it is in the hook's result).
- Stored changes can outlive the code that made them: changing a mutation's variables needs a
  `FORMAT_VERSION` bump.
- `AuthGate` shows "Loading…" only for the very first status read (a failed read retried by the
  app's own observer reset the query to pending and remounted the app in a loop offline).
