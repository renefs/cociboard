"""``/api/pantry`` and the ``in_pantry`` flag of shopping items."""

from fastapi.testclient import TestClient

MONDAY = "2026-10-26"
BASE = f"/api/weeks/{MONDAY}/shopping-list"


def make(client: TestClient, name: str, ingredients: list[str]) -> int:
    response = client.post(
        "/api/recipes",
        json={"name": name, "meal_type": "both", "protein": "none", "ingredients": ingredients},
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def put(client: TestClient, day: int, slot: str, recipe_id: int) -> None:
    r = client.put(f"/api/weeks/{MONDAY}/days/{day}/{slot}", json={"recipe_id": recipe_id})
    assert r.status_code == 200, r.text


def test_empty_pantry(client: TestClient) -> None:
    assert client.get("/api/pantry").json() == {"items": [], "suggestions": []}


def test_add_is_idempotent_and_sorted(client: TestClient) -> None:
    first = client.post("/api/pantry", json={"name": "  Aceite   de oliva "})
    assert first.status_code == 201
    body = first.json()
    assert (body["key"], body["name"]) == ("aceite de oliva", "Aceite de oliva")
    again = client.post("/api/pantry", json={"name": "ACEITE de Oliva"})
    assert again.status_code == 200
    assert again.json() == body
    client.post("/api/pantry", json={"name": "Ajo"})
    assert [i["key"] for i in client.get("/api/pantry").json()["items"]] == [
        "aceite de oliva",
        "ajo",
    ]


def test_add_validates_the_name(client: TestClient) -> None:
    assert client.post("/api/pantry", json={"name": "   "}).status_code == 422
    assert client.post("/api/pantry", json={"name": "x" * 81}).status_code == 422
    assert client.post("/api/pantry", json={"name": "́"}).status_code == 422
    assert client.post("/api/pantry", json={}).status_code == 422


def test_delete_and_404(client: TestClient) -> None:
    item_id = client.post("/api/pantry", json={"name": "Sal"}).json()["id"]
    assert client.delete(f"/api/pantry/{item_id}").status_code == 204
    assert client.get("/api/pantry").json()["items"] == []
    assert client.delete(f"/api/pantry/{item_id}").status_code == 404


def test_suggestions_use_active_recipes_only(client: TestClient) -> None:
    ids = [make(client, f"R{i}", ["Sal", "Pan"]) for i in range(3)]
    archived = make(client, "Old", ["Sal", "Pan", "Ajo"])
    for _ in range(2):
        make(client, f"X{_}", ["Ajo"])
    client.patch(f"/api/recipes/{archived}", json={"archived": True})
    data = client.get("/api/pantry").json()
    assert data["suggestions"] == [
        {"key": "pan", "name": "Pan", "recipe_count": 3},
        {"key": "sal", "name": "Sal", "recipe_count": 3},
    ]
    assert ids
    client.post("/api/pantry", json={"name": "sal"})
    assert [s["key"] for s in client.get("/api/pantry").json()["suggestions"]] == ["pan"]


def test_shopping_items_carry_in_pantry(client: TestClient) -> None:
    a = make(client, "A", ["Aceite de oliva", "Aceite de oliva virgen extra", "Pan"])
    put(client, 0, "lunch", a)
    client.post("/api/pantry", json={"name": "aceite de OLIVA"})
    client.put(f"{BASE}/checks", json={"key": "aceite de oliva", "checked": True})
    client.post(f"{BASE}/extras", json={"name": "Aceite de oliva"})
    data = client.get(BASE).json()
    flags = {i["key"]: (i["in_pantry"], i["checked"]) for i in data["items"]}
    assert flags == {
        "aceite de oliva": (True, True),
        "aceite de oliva virgen extra": (False, False),
        "pan": (False, False),
    }
    assert "in_pantry" not in data["extras"][0]
    item_id = client.get("/api/pantry").json()["items"][0]["id"]
    client.delete(f"/api/pantry/{item_id}")
    assert not any(i["in_pantry"] for i in client.get(BASE).json()["items"])
