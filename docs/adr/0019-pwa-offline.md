# ADR-0019: Installable app with offline reading

## Status
Accepted

## Context
Cociboard is mostly used on a phone in the kitchen or at the shop, where the connection to
the home NAS can be missing or slow. People want an icon on the home screen and want to
see the week's plan and the shopping list even without a connection. The app has no
accounts but may have a household password (ADR-0018), so anything stored on the device
must go when the session ends. We also want no new runtime dependency and to keep the
optimistic, per-week serialised updates intact.

## Decision
- **Hand-written service worker** (`frontend/src/sw/`), bundled by a small custom Vite
  plugin (`frontend/plugins/serviceWorker.ts`) into an unhashed `/sw.js` at build time. The
  plugin injects the list of built asset URLs and a build id (hash of version, asset list and
  shell HTML) so the worker's bytes change with every release and browsers install it.
- **Routing is a pure function** (`routeRequest`): non-GET and cross-origin requests,
  `/api/auth/*`, `/api/backup*` and `/api/health` bypass the worker; other `GET /api/*` are
  network-first with a copy in an `api` cache; page loads are network-first with the cached
  shell (`/`) as the fallback; hashed assets, icons and the manifest are cache-first from a
  versioned precache.
- **Privacy**: a `401` through the worker, and logout or session loss in the page, delete the
  whole `api` cache. Auth and backup responses are never stored.
- **Updates are explicit**: a new worker waits; the page shows a "Reload" bar that posts
  `SKIP_WAITING`, then reloads once on `controllerchange`. This avoids swapping code under a
  page that is in the middle of an edit. The page also calls `registration.update()` when it
  becomes visible.
- **Offline behaviour in TanStack Query**: queries use `networkMode: "offlineFirst"` (the
  worker answers from its cache even when the browser reports offline); mutations keep the
  default `online` mode, so they pause offline and resume in order when the connection
  returns, with the existing optimistic updates and per-week `scope` untouched. The online state
  is seeded from `navigator.onLine` at startup. A banner shows the offline state and the
  number of paused mutations, and `beforeunload` warns while any exist.
- **Server**: `/`, `index.html`, `sw.js` and the manifest are served `no-cache` so updates are
  found; `assets/*` are `immutable`. `.webmanifest` is registered as `application/manifest+json`.
- Registration only happens in production builds and secure contexts; on plain HTTP the app
  works as before.

## Consequences
- Reading works offline after one online visit, on HTTPS or localhost only. On plain HTTP
  nothing changes.
- Offline edits live in memory: closing the page loses them (the browser warns). This is
  deliberate for now.
- The offline view is the last response seen for each URL, so a week never opened before is
  not available offline, and a copy may be older than edits made in another session.
- `navigator.onLine` can say "online" on a network that cannot reach the NAS; the request
  then fails normally and queries keep their last data.
- Cached API data stays on the device until logout, a `401`, or the user clears site data,
  which is the same exposure as the page itself while signed in.
- One more build step to maintain, and `typecheck` runs a second tsconfig (WebWorker lib).

## Alternatives considered
- **vite-plugin-pwa / Workbox**: well tested, but a large dependency tree for a worker of
  about a hundred lines, and its generated code is harder to adapt to the cache-clearing
  rules above.
- **Persisted TanStack query cache in IndexedDB**: would also survive a reload without the
  worker, but stores data outside the HTTP layer we already control, needs its own logout
  and 401 handling and a persistence dependency.
- **Full offline write queue** (persisted mutations replayed later): needs conflict
  handling when two devices edit the same week, idempotency on the API and a way to show
  rejected changes. Too much for the benefit; revisit if lost offline edits turn out to matter.
