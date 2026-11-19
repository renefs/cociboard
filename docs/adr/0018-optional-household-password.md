# ADR-0018: Optional household password

## Status
Accepted

## Context
Cociboard has no login. That suits a home network, but the Docker image is also run on NAS
devices that people expose through port forwarding or a tunnel, where anyone could read and
rewrite the family's plans or download a backup. We want protection that is opt-in, needs no
accounts (one household, one shared secret), keeps existing installs working unchanged and
works with the single-container deployment (ADR-0010).

## Decision
- **Opt-in shared password.** `COCIBOARD_PASSWORD` (plain) or `COCIBOARD_PASSWORD_HASH`
  (scrypt, produced by `python -m cociboard.auth hash`). With neither set, auth is disabled
  and behaviour is identical to earlier versions. Empty strings count as unset because
  docker-compose passes `${VAR:-}` as `""`.
- **Hashing with the standard library** (`hashlib.scrypt`, n=2^15, r=8, p=1, random salt),
  encoded as `scrypt:n:r:p:salt:hash` with base64url fields. The format avoids `$` because
  compose interpolates it in `.env`. A plain password is hashed in memory at startup, with a
  salt derived from the secret key so the session fingerprint is stable across restarts.
  Malformed hashes fail at startup, not at the first login.
- **Stateless signed session cookie** `cociboard_session` = `v1.<issued>.<HMAC-SHA256>`;
  the signature covers a fingerprint of the password hash, so changing the password
  invalidates every session without any server-side session table or migration. HTTP-only,
  `SameSite=Lax`, `Secure` over HTTPS (uvicorn runs with `--proxy-headers`), 90 days, renewed
  by `GET /api/auth/status` when older than a day.
- **Secret key** from `COCIBOARD_SECRET_KEY`, else a random key persisted in
  `cociboard.secret` beside the SQLite file (mode 0600, created atomically, git-ignored), else
  an in-process key for non-file databases (sessions then end on restart; a warning is logged).
- **Enforcement in a pure ASGI middleware** on `/api`, so no route can forget it. Public:
  `health`, `auth/status`, `auth/login`, `auth/logout`. Static files stay public (the shell
  contains no data). The middleware is added inside the CORS middleware so 401s carry CORS
  headers in development.
- **CSRF:** unsafe methods with an `Origin` header that is neither the request's own host nor
  a configured CORS origin get `403 bad_origin`; requests without `Origin` (scripts, curl) are
  allowed and `SameSite=Lax` covers old browsers.
- **Rate limiting:** in memory, 10 failures per client IP and 100 globally per 15 minutes,
  plus about a second of delay after every failure. The global cap exists because
  `X-Forwarded-For` is trusted (`--forwarded-allow-ips "*"`) and can be forged to dodge the
  per-IP limit. The cost is that a flood of bad attempts can lock everyone out of *logging in*
  for up to 15 minutes; existing sessions keep working.
- **Exposure hint:** `/api/auth/status` reports `exposed` when auth is off and the peer
  address is global, and the UI shows a dismissible warning. Behind a reverse proxy the peer
  is the proxy's address, so the hint is best effort.
- Backend errors stay codes (`invalid_password`, `too_many_attempts`, `auth_required`, ...);
  the frontend words them (ADR-0009).

### Alternatives considered
- **Reverse-proxy authentication only** (Authelia, DSM, Cloudflare Access): the most capable
  option and still recommended where available, but it needs extra infrastructure that many
  NAS owners do not run, and direct access to the port stays open.
- **User accounts and roles:** unnecessary for one household; needs a schema, registration
  and recovery flows.
- **HTTP Basic authentication:** no logout, no styled or translated prompt, poor with password
  managers, and the browser resends the password on every request.

## Consequences
- No schema change and no migration; existing databases and tests are unaffected.
- The password is shared: there is no per-person audit and no per-user revocation; changing
  the password is the revocation tool.
- Without HTTPS the password and cookie are readable on the network; the README says to use a
  reverse proxy with TLS.
- Rate-limit state is per process and lost on restart, which is acceptable for a single
  container.
- A plain `COCIBOARD_PASSWORD` in `.env` is readable by anyone with file access; the hash
  variant avoids that.
