from typing import Any

from fastapi.testclient import TestClient

MONDAY = "2026-10-26"
BASE = f"/api/weeks/{MONDAY}/shopping-list"


def make(client: TestClient, name: str, ingredients: list[str], meal_type: str = "both") -> int:
    response = client.post(
        "/api/recipes",
        json={
            "name": name,
            "meal_type": meal_type,
            "protein": "none",
            "ingredients": ingredients,
        },
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def put(client: TestClient, day: int, slot: str, recipe_id: int) -> None:
    r = client.put(f"/api/weeks/{MONDAY}/days/{day}/{slot}", json={"recipe_id": recipe_id})
    assert r.status_code == 200, r.text


def keys(data: dict[str, Any]) -> list[str]:
    return [item["key"] for item in data["items"]]


def test_empty_week(client: TestClient) -> None:
    data = client.get(BASE).json()
    assert data == {"week_start": MONDAY, "items": [], "extras": []}


def test_generated_from_assigned_meals(client: TestClient) -> None:
    a = make(client, "Lentejas", ["Lentejas pardinas", "Aceite de oliva"])
    b = make(client, "Tortilla", ["Huevos", "aceite de oliva"])
    put(client, 0, "lunch", a)
    put(client, 0, "dinner", b)
    data = client.get(BASE).json()
    assert keys(data) == ["aceite de oliva", "huevos", "lentejas pardinas"]
    oil = data["items"][0]
    assert oil["name"] == "Aceite de oliva"
    assert oil["checked"] is False
    assert oil["meals"] == [
        {"day": 0, "slot": "lunch", "recipe_id": a, "recipe_name": "Lentejas"},
        {"day": 0, "slot": "dinner", "recipe_id": b, "recipe_name": "Tortilla"},
    ]


def test_check_uncheck_idempotent(client: TestClient) -> None:
    put(client, 0, "lunch", make(client, "A", ["Sal", "Pan"]))
    for _ in range(2):
        data = client.put(f"{BASE}/checks", json={"key": "sal", "checked": True}).json()
        assert {i["key"]: i["checked"] for i in data["items"]} == {"pan": False, "sal": True}
    data = client.put(f"{BASE}/checks", json={"key": "sal", "checked": False}).json()
    assert not any(i["checked"] for i in data["items"])
    data = client.put(f"{BASE}/checks", json={"key": "sal", "checked": False}).json()
    assert not any(i["checked"] for i in data["items"])


def test_check_unknown_key_is_harmless(client: TestClient) -> None:
    r = client.put(f"{BASE}/checks", json={"key": "nada", "checked": True})
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_uncheck_all_includes_extras(client: TestClient) -> None:
    put(client, 0, "lunch", make(client, "A", ["Sal"]))
    client.put(f"{BASE}/checks", json={"key": "sal", "checked": True})
    extra = client.post(f"{BASE}/extras", json={"name": "Leche"}).json()["extras"][0]
    client.patch(f"{BASE}/extras/{extra['id']}", json={"checked": True})
    data = client.delete(f"{BASE}/checks").json()
    assert not data["items"][0]["checked"]
    assert not data["extras"][0]["checked"]


def test_extras_crud(client: TestClient) -> None:
    r = client.post(f"{BASE}/extras", json={"name": "  Leche "})
    assert r.status_code == 201
    client.post(f"{BASE}/extras", json={"name": "Pan"})
    data = client.get(BASE).json()
    assert [e["name"] for e in data["extras"]] == ["Leche", "Pan"]
    first = data["extras"][0]["id"]
    data = client.patch(f"{BASE}/extras/{first}", json={"name": "Leche entera"}).json()
    assert data["extras"][0]["name"] == "Leche entera"
    assert data["extras"][0]["checked"] is False
    data = client.patch(f"{BASE}/extras/{first}", json={"checked": True}).json()
    assert data["extras"][0] == {"id": first, "name": "Leche entera", "checked": True}
    data = client.delete(f"{BASE}/extras/{first}").json()
    assert [e["name"] for e in data["extras"]] == ["Pan"]


def test_extra_validation(client: TestClient) -> None:
    assert client.post(f"{BASE}/extras", json={"name": "   "}).status_code == 422
    assert client.post(f"{BASE}/extras", json={"name": "x" * 81}).status_code == 422
    extra_id = client.post(f"{BASE}/extras", json={"name": "Pan"}).json()["extras"][0]["id"]
    assert client.patch(f"{BASE}/extras/{extra_id}", json={"name": None}).status_code == 422


def test_non_monday_is_422(client: TestClient) -> None:
    base = "/api/weeks/2026-10-27/shopping-list"
    assert client.get(base).status_code == 422
    assert client.put(f"{base}/checks", json={"key": "a", "checked": True}).status_code == 422
    assert client.delete(f"{base}/checks").status_code == 422
    assert client.post(f"{base}/extras", json={"name": "a"}).status_code == 422
    assert client.patch(f"{base}/extras/1", json={"checked": True}).status_code == 422
    assert client.delete(f"{base}/extras/1").status_code == 422


def test_missing_and_foreign_extras_are_404(client: TestClient) -> None:
    assert client.patch(f"{BASE}/extras/99", json={"checked": True}).status_code == 404
    assert client.delete(f"{BASE}/extras/99").status_code == 404
    extra_id = client.post(f"{BASE}/extras", json={"name": "Pan"}).json()["extras"][0]["id"]
    other = "/api/weeks/2026-11-02/shopping-list"
    assert client.patch(f"{other}/extras/{extra_id}", json={"checked": True}).status_code == 404
    assert client.delete(f"{other}/extras/{extra_id}").status_code == 404


def test_list_follows_plan_changes_and_keeps_checks(client: TestClient) -> None:
    a = make(client, "A", ["Sal"])
    b = make(client, "B", ["Pan"])
    put(client, 0, "lunch", a)
    client.put(f"{BASE}/checks", json={"key": "sal", "checked": True})
    put(client, 0, "lunch", b)
    data = client.get(BASE).json()
    assert keys(data) == ["pan"]
    client.delete(f"/api/weeks/{MONDAY}/days/0/lunch")
    assert client.get(BASE).json()["items"] == []
    put(client, 1, "lunch", a)  # the stored check is still there
    assert client.get(BASE).json()["items"][0]["checked"] is True


def test_recipe_edit_changes_ingredients(client: TestClient) -> None:
    a = make(client, "A", ["Sal"])
    put(client, 0, "lunch", a)
    r = client.patch(f"/api/recipes/{a}", json={"ingredients": ["Pimienta", "sal"]})
    assert r.status_code == 200, r.text
    assert keys(client.get(BASE).json()) == ["pimienta", "sal"]
