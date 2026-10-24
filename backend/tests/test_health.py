from pathlib import Path

from fastapi.testclient import TestClient

from cociboard import __version__
from cociboard.config import Settings
from cociboard.main import create_app


def test_health_returns_status_and_version() -> None:
    client = TestClient(create_app())
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_settings_defaults() -> None:
    settings = Settings()
    assert settings.database_url.startswith("sqlite")


def test_version_matches_package_metadata() -> None:
    from importlib.metadata import version

    assert version("cociboard") == __version__


def test_serves_built_frontend_when_static_dir_is_set(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html><title>Cociboard</title>")
    client = TestClient(create_app(Settings(static_dir=tmp_path, seed_on_startup=False)))
    assert "Cociboard" in client.get("/").text
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/missing.js").status_code == 404


def test_no_frontend_without_static_dir() -> None:
    client = TestClient(create_app(Settings(seed_on_startup=False)))
    assert client.get("/").status_code == 404
