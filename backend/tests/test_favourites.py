"""The recipe ``favourite`` flag: PATCH, filter and its independence from other rules."""

from typing import Any

from fastapi.testclient import TestClient


def make(client: TestClient, **overrides: Any) -> dict[str, Any]:
    payload = {
        "name": "Gazpacho",
        "meal_type": "both",
        "protein": "none",
        "ingredients": ["Tomate"],
        **overrides,
    }
    response = client.post("/api/recipes", json=payload)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def names(client: TestClient, **params: Any) -> list[str]:
    response = client.get("/api/recipes", params=params)
    assert response.status_code == 200
    return [r["name"] for r in response.json()]


def test_recipes_are_not_favourites_by_default(client: TestClient) -> None:
    created = make(client)
    assert created["favourite"] is False


def test_create_can_set_favourite(client: TestClient) -> None:
    assert make(client, favourite=True)["favourite"] is True


def test_patch_toggles_favourite_and_leaves_the_rest(client: TestClient) -> None:
    created = make(client, prep_minutes=10)
    url = f"/api/recipes/{created['id']}"
    body = client.patch(url, json={"favourite": True}).json()
    assert body["favourite"] is True
    assert body["prep_minutes"] == 10
    assert client.get(url).json()["favourite"] is True
    assert client.patch(url, json={"favourite": False}).json()["favourite"] is False


def test_favourite_cannot_be_null(client: TestClient) -> None:
    created = make(client)
    response = client.patch(f"/api/recipes/{created['id']}", json={"favourite": None})
    assert response.status_code == 422


def test_filter_returns_only_favourites_and_combines(client: TestClient) -> None:
    a = make(client, name="Alpha", properties=["vegan"])
    b = make(client, name="Beta", properties=["vegan"])
    make(client, name="Gamma")
    client.patch(f"/api/recipes/{a['id']}", json={"favourite": True})
    client.patch(f"/api/recipes/{b['id']}", json={"favourite": True, "properties": []})

    assert names(client) == ["Alpha", "Beta", "Gamma"]
    assert names(client, favourite="true") == ["Alpha", "Beta"]
    assert names(client, favourite="true", property="vegan") == ["Alpha"]
    assert names(client, favourite="true", q="bet") == ["Beta"]
    assert names(client, favourite="false") == ["Alpha", "Beta", "Gamma"]


def test_favourite_works_on_archived_recipes(client: TestClient) -> None:
    a = make(client, name="Alpha")
    client.patch(f"/api/recipes/{a['id']}", json={"archived": True})
    response = client.patch(f"/api/recipes/{a['id']}", json={"favourite": True})
    assert response.status_code == 200
    assert response.json()["favourite"] is True
    assert response.json()["archived"] is True
    assert names(client, favourite="true") == []
    assert names(client, favourite="true", archived="true") == ["Alpha"]


def test_toggling_never_triggers_the_meal_type_conflict(client: TestClient) -> None:
    a = make(client, name="Alpha", meal_type="lunch")
    client.put("/api/weeks/2026-11-16/days/0/lunch", json={"recipe_id": a["id"]})
    response = client.patch(f"/api/recipes/{a['id']}", json={"favourite": True})
    assert response.status_code == 200
    plan = client.get("/api/weeks/2026-11-16").json()
    assert plan["days"][0]["lunch"]["id"] == a["id"]
    assert plan["days"][0]["lunch"]["favourite"] is True
