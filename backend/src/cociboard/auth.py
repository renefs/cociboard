"""Optional household password: hashing, session tokens, rate limiting and the secret key.

Everything here is pure or takes its inputs (clock, paths) explicitly so it can be unit
tested; the HTTP side lives in ``routers/auth.py`` and ``auth_middleware.py``.
Run ``python -m cociboard.auth hash`` to produce a value for ``COCIBOARD_PASSWORD_HASH``.
"""

import base64
import getpass
import hashlib
import hmac
import logging
import math
import os
import secrets
import sys
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from cociboard.config import Settings

logger = logging.getLogger(__name__)

SESSION_COOKIE = "cociboard_session"
SECRET_FILE_NAME = "cociboard.secret"

SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
HASH_BYTES = 32
_MAX_SCRYPT_N = 2**20

TOKEN_VERSION = "v1"
CLOCK_SKEW_SECONDS = 60
RENEW_AFTER_SECONDS = 24 * 3600
SECONDS_PER_DAY = 24 * 3600

LIMIT_WINDOW_SECONDS = 15 * 60
LIMIT_PER_IP = 10
LIMIT_GLOBAL = 100
FAILURE_DELAY_SECONDS = 1.0
PASSWORD_MAX_LENGTH = 1024


class InvalidPasswordHash(ValueError):
    """The configured password hash is not in the format produced by ``hash_password``."""


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    # maxmem must exceed scrypt's 128 * n * r working set (the default is only 32 MiB).
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=n,
        r=r,
        p=p,
        dklen=HASH_BYTES,
        maxmem=256 * n * r + 1024 * 1024,
    )


def hash_password(password: str, *, n: int = SCRYPT_N, salt: bytes | None = None) -> str:
    """Return ``scrypt:<n>:<r>:<p>:<salt>:<hash>`` (no ``$``: compose interpolates it)."""
    salt = salt if salt is not None else os.urandom(SALT_BYTES)
    digest = _scrypt(password, salt, n, SCRYPT_R, SCRYPT_P)
    return f"scrypt:{n}:{SCRYPT_R}:{SCRYPT_P}:{_b64(salt)}:{_b64(digest)}"


def _parse_hash(encoded: str) -> tuple[int, int, int, bytes, bytes]:
    parts = encoded.split(":")
    if len(parts) != 6 or parts[0] != "scrypt":
        raise InvalidPasswordHash(
            "COCIBOARD_PASSWORD_HASH is not valid; generate one with "
            "`python -m cociboard.auth hash`"
        )
    try:
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        salt, digest = _unb64(parts[4]), _unb64(parts[5])
    except ValueError as error:
        raise InvalidPasswordHash("COCIBOARD_PASSWORD_HASH has invalid fields") from error
    if n < 2 or n > _MAX_SCRYPT_N or n & (n - 1) or not 1 <= r <= 32 or not 1 <= p <= 16:
        raise InvalidPasswordHash("COCIBOARD_PASSWORD_HASH has invalid scrypt parameters")
    if not salt or len(digest) != HASH_BYTES:
        raise InvalidPasswordHash("COCIBOARD_PASSWORD_HASH has an invalid salt or digest")
    return n, r, p, salt, digest


def validate_password_hash(encoded: str) -> None:
    """Raise ``InvalidPasswordHash`` unless ``encoded`` is well formed (called at startup)."""
    _parse_hash(encoded)


def verify_password(password: str, encoded: str) -> bool:
    """Check ``password`` against an encoded hash in constant time."""
    n, r, p, salt, expected = _parse_hash(encoded)
    return hmac.compare_digest(_scrypt(password, salt, n, r, p), expected)


def password_fingerprint(encoded: str) -> str:
    """Stable digest of the hash; sessions are bound to it, so a new password ends them."""
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _sign(key: bytes, issued: int, fingerprint: str) -> str:
    message = f"{TOKEN_VERSION}.{issued}.{fingerprint}".encode()
    return _b64(hmac.new(key, message, hashlib.sha256).digest())


def issue_token(key: bytes, fingerprint: str, now: float) -> str:
    """Create a session cookie value ``v1.<issued>.<signature>``."""
    issued = int(now)
    return f"{TOKEN_VERSION}.{issued}.{_sign(key, issued, fingerprint)}"


def verify_token(
    token: str | None, key: bytes, fingerprint: str, now: float, session_days: int
) -> int | None:
    """Return the issue time of a valid, unexpired token, else ``None``."""
    if not token:
        return None
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != TOKEN_VERSION or not parts[1].isascii():
        return None
    try:
        issued = int(parts[1])
    except ValueError:
        return None
    if not hmac.compare_digest(parts[2], _sign(key, issued, fingerprint)):
        return None
    if issued > now + CLOCK_SKEW_SECONDS or now - issued >= session_days * SECONDS_PER_DAY:
        return None
    return issued


def needs_renewal(issued: int, now: float) -> bool:
    """Sessions older than a day are re-issued so active use never expires."""
    return now - issued > RENEW_AFTER_SECONDS


class LoginRateLimiter:
    """Failed-login limiter: per client IP plus a global cap (X-Forwarded-For can be forged).

    Memory is bounded: every recorded failure is also in the global queue, which is pruned
    by age and never grows beyond the global cap.
    """

    def __init__(
        self,
        *,
        per_ip: int = LIMIT_PER_IP,
        global_limit: int = LIMIT_GLOBAL,
        window: float = LIMIT_WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._per_ip = per_ip
        self._global_limit = global_limit
        self._window = window
        self._clock = clock
        self._lock = threading.Lock()
        self._by_ip: dict[str, deque[float]] = {}
        self._all: deque[tuple[float, str]] = deque()

    def _prune(self, now: float) -> None:
        cutoff = now - self._window
        while self._all and self._all[0][0] <= cutoff:
            _, ip = self._all.popleft()
            failures = self._by_ip.get(ip)
            if failures:
                failures.popleft()
                if not failures:
                    del self._by_ip[ip]

    def retry_after(self, ip: str) -> int | None:
        """Seconds to wait when ``ip`` (or everyone) is blocked, else ``None``."""
        with self._lock:
            now = self._clock()
            self._prune(now)
            return self._wait(ip, now)

    def acquire(self, ip: str) -> int | None:
        """Atomically check the limit and count this attempt as a failure up front.

        Returns the seconds to wait when blocked (nothing is recorded), else ``None``.
        Counting before the password check means concurrent attempts can't all slip
        past the limit; a successful login then calls ``reset``.
        """
        with self._lock:
            now = self._clock()
            self._prune(now)
            wait = self._wait(ip, now)
            if wait is None:
                self._by_ip.setdefault(ip, deque()).append(now)
                self._all.append((now, ip))
            return wait

    def _wait(self, ip: str, now: float) -> int | None:
        waits: list[float] = []
        failures = self._by_ip.get(ip)
        if failures and len(failures) >= self._per_ip:
            waits.append(failures[0] + self._window - now)
        if len(self._all) >= self._global_limit:
            waits.append(self._all[0][0] + self._window - now)
        return max(1, math.ceil(max(waits))) if waits else None

    def record_failure(self, ip: str) -> None:
        with self._lock:
            now = self._clock()
            self._prune(now)
            self._by_ip.setdefault(ip, deque()).append(now)
            self._all.append((now, ip))

    def reset(self, ip: str) -> None:
        """A successful login clears that IP's failures."""
        with self._lock:
            self._by_ip.pop(ip, None)
            self._all = deque(item for item in self._all if item[1] != ip)


def secret_file_path(database_url: str) -> Path | None:
    """Where the persisted secret lives: next to the SQLite file, or ``None`` if not a file."""
    try:
        url = make_url(database_url)
    except ArgumentError:
        return None
    if not url.drivername.startswith("sqlite"):
        return None
    database = url.database
    if not database or database == ":memory:" or database.startswith("file:"):
        return None
    return Path(database).resolve().parent / SECRET_FILE_NAME


def load_or_create_secret(path: Path) -> bytes:
    """Read the session key, creating it (mode 0600, atomically) on first use."""
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        key = _unb64(path.read_text(encoding="ascii").strip())
        if len(key) < 32:
            raise ValueError(f"{path} does not hold a valid session key; delete it") from None
        return key
    key = secrets.token_bytes(32)
    with os.fdopen(descriptor, "w", encoding="ascii") as handle:
        handle.write(_b64(key) + "\n")
    return key


def resolve_secret_key(settings: Settings) -> bytes:
    """COCIBOARD_SECRET_KEY, else the persisted file, else a per-process random key."""
    if settings.secret_key is not None:
        key = settings.secret_key.get_secret_value().encode("utf-8")
        if len(key) < 32:
            logger.warning("COCIBOARD_SECRET_KEY is short; use at least 32 random characters")
        return key
    path = secret_file_path(settings.database_url)
    if path is None:
        logger.warning(
            "No file database and no COCIBOARD_SECRET_KEY: sessions will not survive restarts"
        )
        return secrets.token_bytes(32)
    return load_or_create_secret(path)


@dataclass
class AuthState:
    """Everything the middleware and the auth routes need; lives on ``app.state.auth``."""

    password_hash: str
    key: bytes
    session_days: int
    limiter: LoginRateLimiter = field(default_factory=LoginRateLimiter)
    failure_delay: float = FAILURE_DELAY_SECONDS
    clock: Callable[[], float] = time.time

    def __post_init__(self) -> None:
        self.fingerprint = password_fingerprint(self.password_hash)

    def issue(self) -> str:
        return issue_token(self.key, self.fingerprint, self.clock())

    def session_issued(self, token: str | None) -> int | None:
        return verify_token(token, self.key, self.fingerprint, self.clock(), self.session_days)


def build_auth_state(settings: Settings) -> AuthState | None:
    """Return the auth state, or ``None`` when no password is configured (auth disabled)."""
    if settings.password_hash is not None:
        if settings.password is not None:
            logger.warning(
                "Both COCIBOARD_PASSWORD and COCIBOARD_PASSWORD_HASH set; using the hash"
            )
        validate_password_hash(settings.password_hash)
        encoded = settings.password_hash
        key = resolve_secret_key(settings)
    elif settings.password is not None:
        key = resolve_secret_key(settings)
        # The hash only lives in memory, so derive the salt from the key: the fingerprint
        # (and with it every session) then survives restarts with the same password.
        salt = hmac.new(key, b"cociboard-password-salt", hashlib.sha256).digest()[:SALT_BYTES]
        encoded = hash_password(settings.password.get_secret_value(), salt=salt)
    else:
        return None
    return AuthState(password_hash=encoded, key=key, session_days=settings.session_days)


def _read_password() -> str:
    if sys.stdin.isatty():
        first = getpass.getpass("Password: ")
        if first != getpass.getpass("Repeat password: "):
            raise SystemExit("The passwords do not match")
    else:
        first = sys.stdin.readline().rstrip("\r\n")
    if not first:
        raise SystemExit("The password must not be empty")
    return first


def main(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    if args != ["hash"]:
        raise SystemExit("usage: python -m cociboard.auth hash")
    print(hash_password(_read_password()))


if __name__ == "__main__":
    main()
