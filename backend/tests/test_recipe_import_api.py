from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from cociboard.config import Settings, get_settings
from cociboard.db import get_session
from cociboard.main import create_app
from cociboard.models import Recipe
from cociboard.recipe_import.errors import HTTP_STATUS, ImportErrorCode, ImportFailure
from cociboard.recipe_import.fetch import FetchedPage, PageFetcher
from cociboard.routers.recipes import get_page_fetcher
from test_auth_api import PASSWORD, make_app

FIXTURES = Path(__file__).parent / "fixtures" / "recipe_import"
URL = "https://example.com/lemon"


class FakeFetcher:
    def __init__(self, page: FetchedPage | ImportFailure) -> None:
        self.page = page
        self.urls: list[str] = []

    async def __call__(self, url: str) -> FetchedPage:
        self.urls.append(url)
        if isinstance(self.page, ImportFailure):
            raise self.page
        return self.page


def use_fetcher(app: FastAPI, fetcher: PageFetcher) -> None:
    app.dependency_overrides[get_page_fetcher] = lambda: fetcher


@pytest.fixture
def fetcher() -> FakeFetcher:
    html = (FIXTURES / "plain.html").read_text(encoding="utf-8")
    return FakeFetcher(FetchedPage("https://example.com/final", html))


@pytest.fixture
def api(client: TestClient, fetcher: FakeFetcher) -> Iterator[TestClient]:
    use_fetcher(client.app, fetcher)  # type: ignore[arg-type]  # TestClient.app is typed loosely
    yield client


def test_import_returns_a_draft_and_saves_nothing(
    api: TestClient, fetcher: FakeFetcher, session: Session
) -> None:
    response = api.post("/api/recipes/import", json={"url": URL})
    assert response.status_code == 200
    assert response.json() == {
        "name": "Lemon Chicken Traybake",
        "description": "A simple weeknight dinner.",
        "servings": 4,
        "prep_minutes": 60,
        "ingredients": ["8 chicken thighs", "2 lemons", "500 g baby potatoes", "3 tbsp olive oil"],
        "steps": [
            "Heat the oven to 200C.",
            "Toss everything in a tray.",
            "Roast for 45 minutes.",
        ],
        "source_url": "https://example.com/final",
        "warnings": [],
    }
    assert fetcher.urls == [URL]
    assert api.get("/api/recipes").json() == []


def test_existing_name_is_flagged_even_when_archived(api: TestClient, session: Session) -> None:
    from sqlmodel import select

    api.post(
        "/api/recipes",
        json={
            "name": "lemon chicken traybake",
            "meal_type": "dinner",
            "protein": "poultry",
            "ingredients": ["x"],
        },
    )
    assert "name_exists" in api.post("/api/recipes/import", json={"url": URL}).json()["warnings"]
    recipe = session.exec(select(Recipe)).one()
    api.patch(f"/api/recipes/{recipe.id}", json={"archived": True})
    assert "name_exists" in api.post("/api/recipes/import", json={"url": URL}).json()["warnings"]


@pytest.mark.parametrize(
    ("failure", "status", "detail"),
    [
        (ImportFailure("invalid_url"), 422, {"code": "invalid_url"}),
        (ImportFailure("blocked_address"), 422, {"code": "blocked_address"}),
        (ImportFailure("fetch_failed"), 502, {"code": "fetch_failed"}),
        (ImportFailure("fetch_failed", 404), 502, {"code": "fetch_failed", "status": 404}),
        (ImportFailure("timeout"), 504, {"code": "timeout"}),
        (ImportFailure("too_large"), 413, {"code": "too_large"}),
        (ImportFailure("not_html"), 415, {"code": "not_html"}),
        (ImportFailure("busy"), 429, {"code": "busy"}),
    ],
)
def test_error_codes(
    client: TestClient, failure: ImportFailure, status: int, detail: object
) -> None:
    use_fetcher(client.app, FakeFetcher(failure))  # type: ignore[arg-type]
    response = client.post("/api/recipes/import", json={"url": URL})
    assert response.status_code == status
    assert response.json() == {"detail": detail}


def test_every_failure_code_has_a_status() -> None:
    codes: tuple[ImportErrorCode, ...] = (
        "invalid_url",
        "blocked_address",
        "fetch_failed",
        "timeout",
        "too_large",
        "not_html",
        "no_recipe_found",
        "busy",
    )
    assert set(codes) == set(HTTP_STATUS)


def test_page_without_recipe(client: TestClient) -> None:
    html = (FIXTURES / "no_recipe.html").read_text(encoding="utf-8")
    use_fetcher(client.app, FakeFetcher(FetchedPage(URL, html)))  # type: ignore[arg-type]
    response = client.post("/api/recipes/import", json={"url": URL})
    assert (response.status_code, response.json()) == (422, {"detail": {"code": "no_recipe_found"}})


def test_real_fetcher_refuses_internal_addresses_without_network(client: TestClient) -> None:
    for url in ("http://127.0.0.1:8000/", "http://169.254.169.254/", "ftp://example.com/x"):
        response = client.post("/api/recipes/import", json={"url": url})
        assert response.status_code == 422
        assert response.json()["detail"]["code"] in ("blocked_address", "invalid_url")


def test_missing_url_is_rejected(client: TestClient) -> None:
    assert client.post("/api/recipes/import", json={}).status_code == 422


def test_disabled_setting(client: TestClient, fetcher: FakeFetcher) -> None:
    app: FastAPI = client.app  # type: ignore[assignment]
    use_fetcher(app, fetcher)
    app.dependency_overrides[get_settings] = lambda: Settings(
        seed_on_startup=False, recipe_import=False
    )
    response = client.post("/api/recipes/import", json={"url": URL})
    assert (response.status_code, response.json()) == (404, {"detail": {"code": "import_disabled"}})
    assert fetcher.urls == []


def test_empty_setting_means_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COCIBOARD_RECIPE_IMPORT", "")
    assert Settings().recipe_import is True
    monkeypatch.setenv("COCIBOARD_RECIPE_IMPORT", "false")
    assert Settings().recipe_import is False


def test_auth_is_required_and_origin_checked(tmp_path: Path, fetcher: FakeFetcher) -> None:
    app = make_app(tmp_path)
    use_fetcher(app, fetcher)
    client = TestClient(app)
    assert client.post("/api/recipes/import", json={"url": URL}).status_code == 401
    assert fetcher.urls == []
    assert client.post("/api/auth/login", json={"password": PASSWORD}).status_code == 204
    assert client.post("/api/recipes/import", json={"url": URL}).status_code == 200
    bad_origin = client.post(
        "/api/recipes/import", json={"url": URL}, headers={"Origin": "https://evil.example"}
    )
    assert bad_origin.status_code == 403


def test_app_factory_gives_each_app_a_limiter() -> None:
    assert create_app().state.import_limiter is not create_app().state.import_limiter
    _ = (get_session,)
