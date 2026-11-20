# ADR-0024: Import a recipe from a link

## Status
Accepted

## Context
Typing a recipe by hand is the main friction of the catalogue. Most recipe sites publish the
recipe as schema.org JSON-LD (`<script type="application/ld+json">`) for search engines, so
a link is enough to fill the form. The page has to be downloaded by something, and whatever
does it fetches an address a person typed. That is the textbook server-side request forgery
(SSRF) setup: on a home server or NAS, the address could be the router, a camera, the Docker
socket proxy, the cloud metadata address, or Cociboard itself.

## Decision
- **The server fetches, the client reviews.** `POST /api/recipes/import {url}` answers a
  *draft* and saves nothing; the form is filled in and the user saves it like any recipe, so
  every existing validation and the unique-name rule still apply. The meal type and the main
  protein are not guessed (pages do not say them); the status line asks the user to check them.
- **Parse JSON-LD only, with the standard library.** `html.parser` collects the
  `ld+json` scripts and `json` loads them (invalid blocks are skipped). A `Recipe` is looked for
  anywhere (top level, arrays, `@graph`, nested `mainEntity`; `@type` may be a list).
  Microdata/RDFa and heuristics on page text are not attempted: they are the long tail and the
  main source of wrong guesses. Texts have their HTML removed and are cut to the existing limits
  with warning codes (never silently); the backend sends codes, not text (ADR-0009).
- **SSRF defences** (`recipe_import/validate.py`, `fetch.py`):
  - Only `http`/`https`, a host, no userinfo, ports 80 and 443, at most 2000 characters;
    old-style numeric hosts (`2130706433`, `0x7f.1`) are refused.
  - The host is resolved by the server (`getaddrinfo` in a thread) and **every** resulting
    address must be public: `ipaddress.is_global` plus an explicit denylist (loopback, private,
    link-local, CGNAT `100.64/10`, multicast, reserved, unspecified, site-local, unique-local
    `fc00::/7`, documentation ranges). IPv6 addresses that embed an IPv4 one (IPv4-mapped, 6to4,
    Teredo, NAT64) are unwrapped and the inner address must be public too. One bad address
    refuses the host.
  - **The connection is pinned to the vetted address**: the request goes to
    `scheme://<ip>:<port>/path` with the original `Host` header and, for https, the
    `sni_hostname` extension, so TLS SNI and certificate verification still use the real name
    (`verify=True`). A second DNS lookup, where rebinding would happen, never takes place.
  - Redirects are not followed by the HTTP client: at most 5 are followed by hand, each
    resolved and validated again with the same rules (relative `Location` resolved against the
    current URL). A redirect to an internal address is `blocked_address`.
  - Limits: connect 5 s, read 10 s, 15 s in total, 2 MiB of decoded body (checked while
    streaming, so a compression bomb is cut), `text/html`, `application/xhtml+xml` or
    `application/ld+json` only. No proxies from the environment, no cookies, no credentials;
    a generic `User-Agent` and `Accept`.
  - At most 2 imports at once per process. A third waits up to 2 seconds for a slot, then gets
    `429 busy`: queueing without a bound would let a few slow sites tie up the workers, and a
    long silent wait is worse for the user than a clear "try again".
  - Only the host and the outcome are logged, never the full URL (it may carry tokens).
  - The route is under `/api`, so the household password and the `Origin` check on POST apply.
- **Off switch.** `COCIBOARD_RECIPE_IMPORT=false` makes the endpoint answer `404 import_disabled`.
  The client does not poll for the setting: on the first use that answers `import_disabled` it
  hides the import area for the rest of the session (a module-level flag, not persisted). This
  avoids adding an API surface or a request for a rarely used switch; the cost is one visible
  attempt before the option disappears.
- **Share target.** `manifest.webmanifest` gets a `share_target` (GET to `/` with
  `share-title`, `share-text`, `share-url`). On start, a pure extractor takes `share-url`, or the
  first http(s) link inside `share-text` (apps usually put "Title https://..." there), opens
  the new-recipe form with the import started and removes only the share parameters from the
  address bar, leaving `week` and `view`. The service worker already answers any navigation
  with the shell, so nothing changed there.

## Alternatives considered
- **Fetching in the browser.** Almost every recipe site sends no CORS headers, so the browser
  cannot read the page. Rejected.
- **A third-party parsing or scraping service.** It would send the household's browsing to a
  third party, add an account and a dependency on its availability, and the self-hosted app
  would no longer work offline from the internet. Rejected.
- **A full HTML scraping library (recipe-scrapers, BeautifulSoup).** Broader site coverage, but
  a large dependency that needs constant upkeep for per-site rules, and heuristics that guess
  wrongly. JSON-LD with the standard library covers most sites with little code. A library can
  be added later behind the same `parse_recipe` interface.
- **Letting `httpx` follow redirects, or checking the address and then connecting by name.**
  Both leave a window (a redirect hop, a second DNS lookup) in which the destination changes
  after the check. Rejected in favour of manual hops and a pinned address.

## Consequences
- Sites without JSON-LD (or behind a login, a paywall or bot protection) cannot be imported;
  the user gets `no_recipe_found` or `fetch_failed` and types the recipe.
- Pinning by IP means a host with several addresses uses the first that accepts a connection
  (up to three tried), with no Happy Eyeballs. Acceptable for one page.
- An administrator who runs the server on an intranet cannot import from intranet hosts; that is
  intended.
- `httpx` moves from a development to a runtime dependency.
- Tests never touch the network: resolvers and transports are injected (`httpx.MockTransport`),
  and the endpoint test replaces the page fetcher.
