from typing import Any

import pytest
from fastapi.testclient import TestClient

PAYLOAD: dict[str, Any] = {
    "name": "Gazpacho",
    "meal_type": "both",
    "protein": "none",
    "ingredients": ["Tomate", "Pepino"],
    "properties": ["vegan", "light"],
}


def make(client: TestClient, **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/recipes", json={**PAYLOAD, **overrides})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def test_create_and_get(client: TestClient) -> None:
    created = make(client, prep_minutes=15, description="  Cold soup ")
    assert created["id"] >= 1
    assert created["description"] == "Cold soup"
    assert created["prep_minutes"] == 15
    fetched = client.get(f"/api/recipes/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == created


def test_normalises_input(client: TestClient) -> None:
    created = make(
        client,
        name="  Sopa  ",
        ingredients=["  agua ", "sal"],
        properties=["vegan", "light", "vegan"],
    )
    assert created["name"] == "Sopa"
    assert created["ingredients"] == ["agua", "sal"]
    assert created["properties"] == ["vegan", "light"]


def test_not_found(client: TestClient) -> None:
    assert client.get("/api/recipes/99").status_code == 404
    assert client.patch("/api/recipes/99", json={"name": "x"}).status_code == 404
    assert client.delete("/api/recipes/99").status_code == 404


def test_duplicate_name_conflict(client: TestClient) -> None:
    make(client)
    assert client.post("/api/recipes", json={**PAYLOAD, "name": "gazpacho"}).status_code == 409
    other = make(client, name="Salmorejo")
    response = client.patch(f"/api/recipes/{other['id']}", json={"name": "Gazpacho"})
    assert response.status_code == 409


def test_patch_is_partial(client: TestClient) -> None:
    created = make(client, prep_minutes=10, description="x")
    response = client.patch(
        f"/api/recipes/{created['id']}",
        json={"protein": "eggs", "prep_minutes": None, "properties": ["quick", "quick"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["protein"] == "eggs"
    assert body["prep_minutes"] is None
    assert body["properties"] == ["quick"]
    assert body["name"] == "Gazpacho"
    assert body["description"] == "x"
    assert body["ingredients"] == ["Tomate", "Pepino"]


def test_patch_same_name_allowed(client: TestClient) -> None:
    created = make(client)
    response = client.patch(f"/api/recipes/{created['id']}", json={"name": "Gazpacho"})
    assert response.status_code == 200


def test_delete(client: TestClient) -> None:
    created = make(client)
    assert client.delete(f"/api/recipes/{created['id']}").status_code == 204
    assert client.get(f"/api/recipes/{created['id']}").status_code == 404


def test_validation_errors(client: TestClient) -> None:
    bad_payloads: list[dict[str, Any]] = [
        {**PAYLOAD, "name": ""},
        {**PAYLOAD, "name": "   "},
        {**PAYLOAD, "name": "x" * 81},
        {**PAYLOAD, "ingredients": []},
        {**PAYLOAD, "ingredients": ["ok", "  "]},
        {**PAYLOAD, "prep_minutes": 0},
        {**PAYLOAD, "meal_type": "brunch"},
        {**PAYLOAD, "protein": "rock"},
        {**PAYLOAD, "properties": ["tasty"]},
    ]
    for payload in bad_payloads:
        assert client.post("/api/recipes", json=payload).status_code == 422, payload


def test_patch_validation(client: TestClient) -> None:
    created = make(client)
    url = f"/api/recipes/{created['id']}"
    assert client.patch(url, json={"name": None}).status_code == 422
    assert client.patch(url, json={"ingredients": []}).status_code == 422
    assert client.patch(url, json={"prep_minutes": -3}).status_code == 422


def test_filters(client: TestClient) -> None:
    make(
        client,
        name="Lentejas",
        meal_type="lunch",
        protein="legumes",
        ingredients=["Lentejas", "Chorizo", "Pimentón"],
        properties=["batch_cooking"],
    )
    make(
        client,
        name="Tortilla",
        meal_type="dinner",
        protein="eggs",
        ingredients=["Huevos", "Patatas"],
        properties=["vegetarian", "quick"],
    )
    make(
        client,
        name="Albóndigas",
        meal_type="lunch",
        protein="meat",
        ingredients=["Carne picada", "Guisantes"],
    )
    make(
        client,
        name="Ensalada",
        meal_type="both",
        protein="none",
        ingredients=["Lechuga", "Tomate"],
        properties=["vegetarian", "light", "quick"],
    )

    def names(query: str) -> list[str]:
        response = client.get(f"/api/recipes{query}")
        assert response.status_code == 200
        return [r["name"] for r in response.json()]

    assert names("") == ["Albóndigas", "Ensalada", "Lentejas", "Tortilla"]
    assert names("?slot=lunch") == ["Albóndigas", "Ensalada", "Lentejas"]
    assert names("?slot=dinner") == ["Ensalada", "Tortilla"]
    assert names("?q=choriz") == ["Lentejas"]
    assert names("?q=TORT") == ["Tortilla"]
    assert names("?q=albondigas") == ["Albóndigas"]
    assert names("?q=ALBÓNDIGAS") == ["Albóndigas"]
    assert names("?q=pimenton") == ["Lentejas"]
    assert names("?property=quick") == ["Ensalada", "Tortilla"]
    assert names("?property=quick&property=light") == ["Ensalada"]
    assert names("?slot=dinner&q=tomate&property=vegetarian") == ["Ensalada"]
    assert names("?q=nothing") == []
    assert client.get("/api/recipes?slot=brunch").status_code == 422
    assert client.get("/api/recipes?property=tasty").status_code == 422


def test_new_fields_default_to_empty(client: TestClient) -> None:
    created = make(client)
    assert (created["servings"], created["steps"], created["source_url"]) == (None, [], None)


def test_create_with_servings_steps_and_source(client: TestClient) -> None:
    created = make(
        client,
        servings=4,
        steps=["  Chop ", "", "Cook"],
        source_url=" https://example.com/gazpacho ",
    )
    assert created["servings"] == 4
    assert created["steps"] == ["Chop", "Cook"]
    assert created["source_url"] == "https://example.com/gazpacho"
    assert client.get(f"/api/recipes/{created['id']}").json() == created


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("servings", 0),
        ("servings", 51),
        ("source_url", "javascript:alert(1)"),
        ("source_url", "/relative"),
        ("source_url", "data:text/plain,hi"),
        ("steps", ["x"] * 51),
        ("steps", ["x" * 1001]),
    ],
)
def test_invalid_new_fields_are_422_with_field_error(
    client: TestClient, field: str, value: Any
) -> None:
    response = client.post("/api/recipes", json={**PAYLOAD, field: value})
    assert response.status_code == 422
    assert field in response.json()["detail"][0]["loc"]


def test_patch_sets_and_clears_new_fields(client: TestClient) -> None:
    created = make(client, servings=2, steps=["a"], source_url="https://example.com")
    url = f"/api/recipes/{created['id']}"
    patched = client.patch(url, json={"servings": 6, "steps": [" b ", "c"]}).json()
    assert (patched["servings"], patched["steps"]) == (6, ["b", "c"])
    assert patched["source_url"] == "https://example.com"  # untouched
    cleared = client.patch(url, json={"servings": None, "source_url": None, "steps": []}).json()
    assert (cleared["servings"], cleared["source_url"], cleared["steps"]) == (None, None, [])


def test_patch_rejects_null_steps_and_bad_url(client: TestClient) -> None:
    created = make(client)
    url = f"/api/recipes/{created['id']}"
    assert client.patch(url, json={"steps": None}).status_code == 422
    assert client.patch(url, json={"source_url": "javascript:x"}).status_code == 422


def test_search_ignores_steps(client: TestClient) -> None:
    make(client, steps=["Marinate overnight"])
    assert client.get("/api/recipes", params={"q": "marinate"}).json() == []
