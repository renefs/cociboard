from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from cociboard.auth import SESSION_COOKIE, hash_password
from cociboard.config import Settings
from cociboard.db import get_session
from cociboard.main import create_app

PASSWORD = "open sesame"


def with_memory_db(app: FastAPI) -> FastAPI:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)

    def override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    return app


def make_app(tmp_path: Path, **overrides: object) -> FastAPI:
    values: dict[str, object] = {
        "database_url": f"sqlite:///{tmp_path}/test.db",
        "seed_on_startup": False,
        "password": SecretStr(PASSWORD),
        **overrides,
    }
    settings = Settings.model_validate(values)
    app = create_app(settings)
    app.state.auth.failure_delay = 0
    return with_memory_db(app)


@pytest.fixture
def app(tmp_path: Path) -> FastAPI:
    return make_app(tmp_path)


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


def login(client: TestClient, password: str = PASSWORD) -> int:
    status: int = client.post("/api/auth/login", json={"password": password}).status_code
    return status


def test_empty_strings_mean_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("PASSWORD", "PASSWORD_HASH", "SECRET_KEY"):
        monkeypatch.setenv(f"COCIBOARD_{name}", "" if name != "PASSWORD_HASH" else " ")
    settings = Settings()
    assert settings.password is None
    assert settings.password_hash is None
    assert settings.secret_key is None


def test_disabled_mode_is_open(tmp_path: Path) -> None:
    app = with_memory_db(
        create_app(Settings(database_url=f"sqlite:///{tmp_path}/x.db", seed_on_startup=False))
    )
    client = TestClient(app)
    assert client.get("/api/auth/status").json() == {
        "enabled": False,
        "authenticated": True,
        "exposed": False,
    }
    assert client.get("/api/recipes").status_code == 200
    assert client.post("/api/auth/login", json={"password": "x"}).status_code == 404
    assert not list(tmp_path.glob("*.secret"))


@pytest.mark.parametrize(
    ("ip", "exposed"), [("8.8.8.8", True), ("127.0.0.1", False), ("192.168.1.5", False)]
)
def test_exposed_flag_only_for_global_clients(tmp_path: Path, ip: str, exposed: bool) -> None:
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path}/x.db", seed_on_startup=False))
    client = TestClient(app, client=(ip, 123))
    assert client.get("/api/auth/status").json()["exposed"] is exposed


def test_exposed_is_false_when_auth_is_enabled(app: FastAPI) -> None:
    status = TestClient(app, client=("8.8.8.8", 1)).get("/api/auth/status").json()
    assert status == {"enabled": True, "authenticated": False, "exposed": False}


def test_secret_file_only_when_enabled(tmp_path: Path) -> None:
    make_app(tmp_path)
    assert (tmp_path / "cociboard.secret").exists()


def test_protected_routes_need_a_session(client: TestClient) -> None:
    for method, path in [
        ("get", "/api/recipes"),
        ("get", "/api/backup"),
        ("get", "/api/pantry"),
        ("post", "/api/pantry"),
        ("delete", "/api/pantry/1"),
        ("delete", "/api/weeks/2026-11-16"),
    ]:
        response = getattr(client, method)(path)
        assert response.status_code == 401
        assert response.json() == {"detail": {"code": "auth_required"}}
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/auth/status").json()["authenticated"] is False


def test_login_sets_a_session_cookie(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"password": PASSWORD})
    assert response.status_code == 204
    header = response.headers["set-cookie"]
    assert f"{SESSION_COOKIE}=v1." in header
    assert "HttpOnly" in header
    assert "SameSite=lax" in header
    assert "Path=/" in header
    assert f"Max-Age={90 * 86400}" in header
    assert "Secure" not in header
    assert client.get("/api/recipes").status_code == 200
    assert client.get("/api/auth/status").json() == {
        "enabled": True,
        "authenticated": True,
        "exposed": False,
    }


def test_cookie_is_secure_over_https(app: FastAPI) -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post("/api/auth/login", json={"password": PASSWORD})
    assert "Secure" in response.headers["set-cookie"]


def test_wrong_password(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"password": "nope"})
    assert response.status_code == 401
    assert response.json() == {"detail": {"code": "invalid_password"}}
    assert "set-cookie" not in response.headers
    assert client.post("/api/auth/login", json={"password": "x" * 2000}).status_code == 422


def test_rate_limit_after_ten_failures(client: TestClient) -> None:
    for _ in range(10):
        assert login(client, "bad") == 401
    response = client.post("/api/auth/login", json={"password": PASSWORD})
    assert response.status_code == 429
    detail = response.json()["detail"]
    assert detail["code"] == "too_many_attempts"
    assert 1 <= detail["retry_after"] <= 900
    assert response.headers["retry-after"] == str(detail["retry_after"])


def test_logout_clears_the_cookie(client: TestClient) -> None:
    login(client)
    response = client.post("/api/auth/logout")
    assert response.status_code == 204
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert client.get("/api/recipes").status_code == 401


def test_changing_the_password_logs_everyone_out(tmp_path: Path) -> None:
    first = TestClient(make_app(tmp_path))
    assert login(first) == 204
    cookie = first.cookies[SESSION_COOKIE]
    second_app = make_app(tmp_path, password=SecretStr("different"))
    second = TestClient(second_app)
    second.cookies.set(SESSION_COOKIE, cookie)
    assert second.get("/api/auth/status").json()["authenticated"] is False
    # Same password and same secret file: the session survives a restart.
    third = TestClient(make_app(tmp_path))
    third.cookies.set(SESSION_COOKIE, cookie)
    assert third.get("/api/auth/status").json()["authenticated"] is True


def test_password_hash_wins_over_password(tmp_path: Path) -> None:
    app = make_app(tmp_path, password_hash=hash_password("from hash", n=2**4))
    client = TestClient(app)
    assert login(client, PASSWORD) == 401
    assert login(client, "from hash") == 204


def test_invalid_hash_fails_at_startup(tmp_path: Path) -> None:
    from cociboard.auth import InvalidPasswordHash

    with pytest.raises(InvalidPasswordHash):
        make_app(tmp_path, password_hash="garbage")


def test_status_renews_an_old_session(app: FastAPI, client: TestClient) -> None:
    login(client)
    start = app.state.auth.clock()
    app.state.auth.clock = lambda: start + 2 * 86400
    response = client.get("/api/auth/status")
    assert response.json()["authenticated"] is True
    assert SESSION_COOKIE in response.headers["set-cookie"]
    fresh = client.get("/api/auth/status")
    assert "set-cookie" not in fresh.headers


def test_bad_origin_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"password": PASSWORD}, headers={"Origin": "https://evil.example"}
    )
    assert response.status_code == 403
    assert response.json() == {"detail": {"code": "bad_origin"}}
    login(client)
    response = client.delete("/api/weeks/2026-11-16", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    # Safe methods are not origin-checked.
    assert client.get("/api/recipes", headers={"Origin": "https://evil.example"}).status_code == 200


def test_good_origins_are_accepted(tmp_path: Path) -> None:
    app = make_app(tmp_path, cors_origins=["http://localhost:5173"])
    client = TestClient(app)
    for origin, extra in [
        ("http://testserver", {}),
        ("http://localhost:5173", {}),
        ("https://plans.example.com", {"X-Forwarded-Host": "plans.example.com"}),
    ]:
        response = client.post(
            "/api/auth/login", json={"password": PASSWORD}, headers={"Origin": origin, **extra}
        )
        assert response.status_code == 204, origin


def test_unauthorized_response_carries_cors_headers(tmp_path: Path) -> None:
    client = TestClient(make_app(tmp_path, cors_origins=["http://localhost:5173"]))
    response = client.get("/api/recipes", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_static_files_stay_public(tmp_path: Path) -> None:
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<title>Cociboard</title>")
    client = TestClient(make_app(tmp_path, static_dir=static))
    assert "Cociboard" in client.get("/").text
