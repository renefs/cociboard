import io
import os
import stat
import sys
from pathlib import Path

import pytest

from cociboard import auth
from cociboard.auth import (
    InvalidPasswordHash,
    LoginRateLimiter,
    hash_password,
    issue_token,
    load_or_create_secret,
    needs_renewal,
    password_fingerprint,
    secret_file_path,
    verify_password,
    verify_token,
)

FAST_N = 2**4  # keep the tests quick; production uses 2**15


def test_hash_round_trip_and_format() -> None:
    encoded = hash_password("correct horse", n=FAST_N)
    assert "$" not in encoded
    assert encoded.startswith(f"scrypt:{FAST_N}:8:1:")
    assert verify_password("correct horse", encoded)
    assert not verify_password("wrong", encoded)
    assert hash_password("correct horse", n=FAST_N) != encoded  # random salt


def test_default_cost_hash_verifies() -> None:
    encoded = hash_password("pässword")
    assert encoded.split(":")[1] == str(2**15)
    assert verify_password("pässword", encoded)


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "plain",
        "scrypt:16:8:1:abc",
        "scrypt:x:8:1:AAAA:BBBB",
        "bcrypt:16:8:1:AAAA:BBBB",
        "scrypt:15:8:1:AAAA:BBBB",
        "scrypt:16:8:1:AAAA:BBBB",
    ],
)
def test_malformed_hash_raises(bad: str) -> None:
    with pytest.raises(InvalidPasswordHash):
        auth.validate_password_hash(bad)
    with pytest.raises(InvalidPasswordHash):
        verify_password("x", bad)


KEY = b"k" * 32
FP = password_fingerprint(hash_password("pw", n=FAST_N))


def test_token_round_trip() -> None:
    token = issue_token(KEY, FP, 1000.0)
    assert token.startswith("v1.1000.")
    assert verify_token(token, KEY, FP, 1000.0, 90) == 1000


def test_token_expires_after_session_days() -> None:
    token = issue_token(KEY, FP, 1000.0)
    day = 86400
    assert verify_token(token, KEY, FP, 1000.0 + 89 * day, 90) == 1000
    assert verify_token(token, KEY, FP, 1000.0 + 90 * day, 90) is None


def test_token_from_the_future() -> None:
    token = issue_token(KEY, FP, 1000.0)
    assert verify_token(token, KEY, FP, 1000.0 - 30, 90) == 1000  # within skew
    assert verify_token(token, KEY, FP, 1000.0 - 120, 90) is None


def test_tampered_and_garbage_tokens() -> None:
    token = issue_token(KEY, FP, 1000.0)
    _, _, sig = token.split(".")
    assert verify_token(f"v1.2000.{sig}", KEY, FP, 2000.0, 90) is None
    assert verify_token(token + "x", KEY, FP, 1000.0, 90) is None
    assert verify_token(token, b"o" * 32, FP, 1000.0, 90) is None
    for junk in (None, "", "v1", "v2.1.2", "v1.abc.def", "v1.1.2.3"):
        assert verify_token(junk, KEY, FP, 1000.0, 90) is None


def test_changing_the_password_invalidates_tokens() -> None:
    token = issue_token(KEY, FP, 1000.0)
    other = password_fingerprint(hash_password("other", n=FAST_N))
    assert verify_token(token, KEY, other, 1000.0, 90) is None


def test_needs_renewal() -> None:
    assert not needs_renewal(1000, 1000 + 86400)
    assert needs_renewal(1000, 1000 + 86401)


def test_secret_file_created_private_and_reused(tmp_path: Path) -> None:
    path = tmp_path / "cociboard.secret"
    first = load_or_create_secret(path)
    assert len(first) == 32
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert load_or_create_secret(path) == first


def test_secret_file_invalid_content(tmp_path: Path) -> None:
    path = tmp_path / "cociboard.secret"
    path.write_text("abc\n")
    with pytest.raises(ValueError, match="valid session key"):
        load_or_create_secret(path)


def test_secret_file_path_from_database_url(tmp_path: Path) -> None:
    assert secret_file_path(f"sqlite:///{tmp_path}/x.db") == tmp_path.resolve() / "cociboard.secret"
    assert secret_file_path("sqlite://") is None
    assert secret_file_path("sqlite:///:memory:") is None
    assert secret_file_path("postgresql://u@h/db") is None


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_limiter_blocks_per_ip_until_oldest_failure_leaves() -> None:
    clock = Clock()
    limiter = LoginRateLimiter(per_ip=3, global_limit=100, window=900, clock=clock)
    for _ in range(3):
        assert limiter.retry_after("a") is None
        limiter.record_failure("a")
        clock.now += 10
    assert limiter.retry_after("a") == 900 - 30
    assert limiter.retry_after("b") is None
    clock.now += 870  # the oldest failure is now exactly a window old
    assert limiter.retry_after("a") is None


def test_limiter_global_cap_blocks_every_ip() -> None:
    clock = Clock()
    limiter = LoginRateLimiter(per_ip=10, global_limit=5, window=900, clock=clock)
    for i in range(5):
        limiter.record_failure(f"ip{i}")
    assert limiter.retry_after("fresh") == 900
    clock.now += 900
    assert limiter.retry_after("fresh") is None


def test_limiter_success_resets_and_memory_is_pruned() -> None:
    clock = Clock()
    limiter = LoginRateLimiter(per_ip=2, global_limit=100, window=900, clock=clock)
    limiter.record_failure("a")
    limiter.record_failure("a")
    assert limiter.retry_after("a") is not None
    limiter.reset("a")
    assert limiter.retry_after("a") is None
    limiter.record_failure("b")
    clock.now += 901
    assert limiter.retry_after("b") is None
    assert not limiter._by_ip and not limiter._all


def test_cli_hash_reads_stdin(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO("s3cret pass\n"))
    auth.main(["hash"])
    encoded = capsys.readouterr().out.strip()
    assert "$" not in encoded
    assert verify_password("s3cret pass", encoded)


def test_cli_rejects_empty_password_and_bad_usage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO("\n"))
    with pytest.raises(SystemExit):
        auth.main(["hash"])
    with pytest.raises(SystemExit):
        auth.main([])


def test_acquire_counts_the_attempt_before_the_check_so_concurrent_logins_are_limited() -> None:
    clock = [0.0]
    limiter = LoginRateLimiter(per_ip=3, global_limit=100, window=900, clock=lambda: clock[0])
    # Three attempts in flight at once all pass; the fourth is refused before any finishes.
    assert [limiter.acquire("a") for _ in range(3)] == [None, None, None]
    assert limiter.acquire("a") == 900
    limiter.reset("a")  # one of them succeeded
    assert limiter.acquire("a") is None
