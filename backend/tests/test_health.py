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


def _frontend(tmp_path: Path, password: str | None = None) -> TestClient:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Cociboard</title>")
    (tmp_path / "sw.js").write_text("self.addEventListener('fetch', () => {});")
    (tmp_path / "manifest.webmanifest").write_text('{"name": "Cociboard"}')
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1);")
    (tmp_path / "icon-192.png").write_bytes(b"\x89PNG")
    settings = Settings(static_dir=tmp_path, seed_on_startup=False, password=password)
    return TestClient(create_app(settings))


def test_shell_service_worker_and_manifest_are_revalidated(tmp_path: Path) -> None:
    client = _frontend(tmp_path)
    for path in ("/", "/index.html", "/sw.js", "/manifest.webmanifest"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-cache", path


def test_manifest_has_the_web_manifest_mime_type(tmp_path: Path) -> None:
    response = _frontend(tmp_path).get("/manifest.webmanifest")
    assert response.headers["content-type"].startswith("application/manifest+json")


def test_hashed_assets_are_immutable_and_icons_keep_default_caching(tmp_path: Path) -> None:
    client = _frontend(tmp_path)
    assert "immutable" in client.get("/assets/index-abc123.js").headers["cache-control"]
    assert "cache-control" not in client.get("/icon-192.png").headers


def test_service_worker_and_manifest_load_without_a_session(tmp_path: Path) -> None:
    client = _frontend(tmp_path, password="secret")
    assert client.get("/api/recipes").status_code == 401
    assert client.get("/sw.js").status_code == 200
    assert client.get("/manifest.webmanifest").status_code == 200
