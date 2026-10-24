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
