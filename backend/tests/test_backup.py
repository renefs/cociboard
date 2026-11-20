"""Backup export and replace-all restore."""

import copy
import sqlite3
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select

from cociboard import __version__
from cociboard.backup import parse_backup
from cociboard.backup_repo import restore_backup
from cociboard.db import get_session
from cociboard.main import create_app
from cociboard.models import MealAssignment, Recipe, ShoppingCheck, ShoppingExtra
from cociboard.routers.weeks import get_today

MONDAY = "2026-10-26"


def make(client: TestClient, name: str, meal_type: str = "both", **extra: Any) -> int:
    payload = {
        "name": name,
        "meal_type": meal_type,
        "protein": "fish",
        "ingredients": ["Tomate", "Sal"],
        "properties": ["quick"],
        "description": "Tasty",
        "prep_minutes": 20,
        **extra,
    }
    response = client.post("/api/recipes", json=payload)
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def populate(client: TestClient) -> None:
    a = make(client, "Alpha")
    b = make(client, "Beta", "dinner")
    c = make(client, "Gamma")
    client.put(f"/api/weeks/{MONDAY}/days/0/lunch", json={"recipe_id": a})
    client.put(f"/api/weeks/{MONDAY}/days/0/dinner", json={"recipe_id": b})
    client.put("/api/weeks/2026-11-02/days/4/dinner", json={"recipe_id": c})
    client.patch(f"/api/recipes/{c}", json={"archived": True})
    client.put(f"/api/weeks/{MONDAY}/shopping-list/checks", json={"key": "tomate", "checked": True})
    client.post(f"/api/weeks/{MONDAY}/shopping-list/extras", json={"name": "Milk"})
    client.post("/api/pantry", json={"name": "Sal"})


def export(client: TestClient) -> dict[str, Any]:
    response = client.get("/api/backup")
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def normalised(doc: dict[str, Any]) -> dict[str, Any]:
    """Drop what legitimately differs between exports: ids and the export time."""
    out = copy.deepcopy(doc)
    out.pop("exported_at")
    by_ref = {r["ref"]: r["name"] for r in out["recipes"]}
    for recipe in out["recipes"]:
        del recipe["ref"]
    for meal in out["meals"]:
        meal["recipe"] = by_ref.get(meal.pop("recipe_ref"))
    return out


def restore(client: TestClient, doc: object) -> Any:
    return client.post("/api/backup/restore", json=doc)


def test_export_shape_and_header(client: TestClient) -> None:
    client.app.dependency_overrides[get_today] = lambda: date(2026, 11, 19)  # type: ignore[attr-defined]
    populate(client)
    response = client.get("/api/backup")
    assert response.headers["content-disposition"] == (
        'attachment; filename="cociboard-backup-2026-11-19.json"'
    )
    doc = response.json()
    assert doc["format"] == "cociboard-backup"
    assert doc["format_version"] == 5
    assert doc["app_version"] == __version__
    assert doc["exported_at"]
    assert [r["name"] for r in doc["recipes"]] == ["Alpha", "Beta", "Gamma"]
    alpha = doc["recipes"][0]
    assert set(alpha) == {
        "ref",
        "name",
        "description",
        "meal_type",
        "protein",
        "prep_minutes",
        "ingredients",
        "properties",
        "servings",
        "steps",
        "source_url",
        "archived",
        "created_at",
    }
    assert [r["archived"] for r in doc["recipes"]] == [False, False, True]
    assert len(doc["meals"]) == 3
    assert {
        "week_start": MONDAY,
        "day": 0,
        "slot": "lunch",
        "recipe_ref": alpha["ref"],
        "special": None,
        "note": None,
    } in doc["meals"]
    assert doc["shopping_checks"] == [{"week_start": MONDAY, "item_key": "tomate"}]
    assert [(e["name"], e["checked"]) for e in doc["shopping_extras"]] == [("Milk", False)]


def test_export_of_empty_database(client: TestClient) -> None:
    doc = export(client)
    assert (doc["recipes"], doc["meals"], doc["shopping_checks"], doc["shopping_extras"]) == (
        [],
        [],
        [],
        [],
    )


def test_round_trip_into_empty_database(client: TestClient) -> None:
    populate(client)
    original = export(client)

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as other:
        app = create_app()
        app.dependency_overrides[get_session] = lambda: other
        target = TestClient(app)
        result = restore(target, original)
        assert result.status_code == 200
        assert result.json() == {
            "recipes": 3,
            "meals": 3,
            "shopping_checks": 1,
            "shopping_extras": 1,
            "pantry": 1,
        }
        again = export(target)
        assert normalised(again) == normalised(original)
        plan = target.get(f"/api/weeks/{MONDAY}").json()
        assert plan["days"][0]["lunch"]["name"] == "Alpha"
        assert target.get("/api/weeks/2026-11-02").json()["days"][4]["dinner"]["archived"] is True


def test_restore_replaces_existing_data(client: TestClient, session: Session) -> None:
    populate(client)
    doc = export(client)
    make(client, "Extra")
    client.put("/api/weeks/2026-12-07/days/1/lunch", json={"recipe_id": make(client, "More")})
    client.post("/api/weeks/2026-12-07/shopping-list/extras", json={"name": "Bread"})

    assert restore(client, doc).status_code == 200

    assert sorted(r.name for r in session.exec(select(Recipe))) == ["Alpha", "Beta", "Gamma"]
    assert len(session.exec(select(MealAssignment)).all()) == 3
    assert len(session.exec(select(ShoppingCheck)).all()) == 1
    assert [e.name for e in session.exec(select(ShoppingExtra))] == ["Milk"]
    assert normalised(export(client)) == normalised(doc)


def test_restore_empty_backup_clears_everything(client: TestClient) -> None:
    populate(client)
    empty = {
        **export(client),
        "recipes": [],
        "meals": [],
        "shopping_checks": [],
        "shopping_extras": [],
        "pantry": [],
    }
    assert restore(client, empty).json() == {
        "recipes": 0,
        "meals": 0,
        "shopping_checks": 0,
        "shopping_extras": 0,
        "pantry": 0,
    }
    assert client.get("/api/recipes").json() == []


def valid_doc(client: TestClient) -> dict[str, Any]:
    populate(client)
    return export(client)


def code_of(response: Any) -> dict[str, Any]:
    assert response.status_code == 422, response.text
    detail: dict[str, Any] = response.json()["detail"]
    return detail


def test_rejects_non_documents(client: TestClient) -> None:
    assert code_of(restore(client, [1, 2]))["code"] == "invalid_document"
    response = client.post(
        "/api/backup/restore", content=b"not json", headers={"content-type": "application/json"}
    )
    assert code_of(response)["code"] == "invalid_document"


def test_rejects_wrong_format_and_versions(client: TestClient) -> None:
    doc = valid_doc(client)
    assert code_of(restore(client, {**doc, "format": "other"}))["code"] == "wrong_format"
    unsupported = code_of(restore(client, {**doc, "format_version": 6}))
    assert unsupported["code"] == "unsupported_version"
    assert unsupported["params"] == {"version": 6}
    assert code_of(restore(client, {**doc, "format_version": "1"}))["code"] == "invalid_document"


def mutate(doc: dict[str, Any], change: Any) -> dict[str, Any]:
    out = copy.deepcopy(doc)
    change(out)
    return out


@pytest.mark.parametrize(
    ("change", "code"),
    [
        (lambda d: d["recipes"][0].update(name="  "), "invalid_document"),
        (lambda d: d["recipes"][0].update(ingredients=[]), "invalid_document"),
        (lambda d: d["recipes"][0].update(meal_type="brunch"), "invalid_document"),
        (lambda d: d["recipes"][0].update(prep_minutes=0), "invalid_document"),
        (lambda d: d["recipes"][0].update(servings=0), "invalid_document"),
        (lambda d: d["recipes"][0].update(source_url="javascript:alert(1)"), "invalid_document"),
        (lambda d: d["recipes"][0].update(steps=["x"] * 51), "invalid_document"),
        (lambda d: d["recipes"][1].update(name="alpha"), "duplicate_recipe_name"),
        (lambda d: d["recipes"][1].update(ref=d["recipes"][0]["ref"]), "duplicate_recipe_ref"),
        (lambda d: d["meals"][0].update(recipe_ref=9999), "unknown_recipe_ref"),
        (lambda d: d["meals"][0].update(week_start="2026-10-27"), "invalid_week"),
        (lambda d: d["meals"][0].update(day=7), "invalid_day"),
        (lambda d: d["meals"][0].update(slot="brunch"), "invalid_document"),
        (lambda d: d["meals"].append(dict(d["meals"][0])), "duplicate_slot"),
        (lambda d: d["meals"][0].update(slot="lunch"), "meal_does_not_fit"),
        (lambda d: d["shopping_checks"][0].update(week_start="2026-10-27"), "invalid_week"),
        (lambda d: d["shopping_extras"][0].update(week_start="2026-10-27"), "invalid_week"),
        (
            lambda d: d["shopping_checks"].append(dict(d["shopping_checks"][0])),
            "duplicate_shopping_check",
        ),
        (lambda d: d["shopping_extras"][0].update(name=""), "invalid_document"),
        (lambda d: d.pop("meals"), "invalid_document"),
        (lambda d: d["pantry"].append({"name": "sal"}), "duplicate_pantry_item"),
        (lambda d: d["pantry"].append({"name": ""}), "invalid_document"),
        (lambda d: d["pantry"].append({"name": "\u0301"}), "invalid_pantry_item"),
    ],
)
def test_validation_errors_and_untouched_data(client: TestClient, change: Any, code: str) -> None:
    doc = valid_doc(client)
    before = export(client)
    bad = mutate(doc, change)
    # Meals are sorted by slot name, so meals[0] is Beta (dinner only) on Monday.
    assert code_of(restore(client, bad))["code"] == code
    assert normalised(export(client)) == normalised(before)


def test_rollback_on_failure_leaves_data_untouched(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    doc = valid_doc(client)
    before = normalised(export(client))
    parsed = parse_backup(doc)
    original_flush = session.flush
    calls = {"n": 0}

    def flaky(*args: Any, **kwargs: Any) -> None:
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        original_flush(*args, **kwargs)

    monkeypatch.setattr(session, "flush", flaky)
    with pytest.raises(RuntimeError):
        restore_backup(session, parsed)
    monkeypatch.undo()
    assert normalised(export(client)) == before


def test_oversized_body_is_413(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("cociboard.routers.backup.MAX_BACKUP_BYTES", 100)
    response = client.post(
        "/api/backup/restore", content=b"x" * 500, headers={"content-type": "application/json"}
    )
    assert response.status_code == 413


def test_restore_writes_safety_copy_for_file_database(tmp_path: Path) -> None:
    db = tmp_path / "live.db"
    engine = create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as live:
        app = create_app()
        app.dependency_overrides[get_session] = lambda: live
        client = TestClient(app)
        make(client, "Keep me")
        doc = export(client)
        make(client, "Added later")

        assert restore(client, doc).status_code == 200

        copies = list(tmp_path.glob("live.db.bak-pre-restore-*"))
        assert len(copies) == 1
        saved = sqlite3.connect(copies[0])
        try:
            names = sorted(r[0] for r in saved.execute("SELECT name FROM recipe"))
        finally:
            saved.close()
        assert names == ["Added later", "Keep me"]  # the state before the restore
        assert sorted(r.name for r in live.exec(select(Recipe))) == ["Keep me"]


def test_pre_restore_copies_rotate_separately(tmp_path: Path) -> None:
    import os

    from cociboard.dbfiles import backup_sqlite

    db = tmp_path / "live.db"
    engine = create_engine(f"sqlite:///{db}")
    SQLModel.metadata.create_all(engine)
    migration_copy = tmp_path / "live.db.bak-0001_initial-20260101T000000Z"
    migration_copy.write_bytes(b"old")
    os.utime(migration_copy, (1_600_000_000, 1_600_000_000))
    for i in range(4):
        old = tmp_path / f"live.db.bak-pre-restore-2026010{i + 1}T000000Z"
        old.write_bytes(b"old")
        os.utime(old, (1_700_000_000 + i, 1_700_000_000 + i))

    assert backup_sqlite(engine, "pre-restore") is not None

    assert len(list(tmp_path.glob("live.db.bak-pre-restore-*"))) == 3
    assert migration_copy.exists()


def test_backup_sqlite_ignores_memory_databases() -> None:
    from cociboard.dbfiles import backup_sqlite

    assert backup_sqlite(create_engine("sqlite://"), "pre-restore") is None


def special_populate(client: TestClient) -> None:
    a = make(client, "Alpha")
    client.put(f"/api/weeks/{MONDAY}/days/0/lunch", json={"recipe_id": a, "note": "Double batch"})
    client.put(f"/api/weeks/{MONDAY}/days/0/dinner", json={"special": "eating_out"})
    client.put(f"/api/weeks/{MONDAY}/days/1/dinner", json={"special": "leftovers", "note": "Ana"})


def test_v3_round_trip_keeps_specials_and_notes(client: TestClient) -> None:
    special_populate(client)
    before = export(client)
    assert before["format_version"] == 5
    kinds = {
        (m["day"], m["slot"]): (m["recipe_ref"], m["special"], m["note"]) for m in before["meals"]
    }
    assert kinds[(0, "dinner")] == (None, "eating_out", None)
    assert kinds[(1, "dinner")] == (None, "leftovers", "Ana")
    assert kinds[(0, "lunch")][1:] == (None, "Double batch")

    assert restore(client, before).status_code == 200
    assert normalised(export(client)) == normalised(before)
    week = client.get(f"/api/weeks/{MONDAY}").json()["days"]
    assert week[0]["dinner_special"] == "eating_out"
    assert week[0]["lunch_note"] == "Double batch"
    assert week[1]["dinner_note"] == "Ana"


def test_v1_backup_still_restores(client: TestClient) -> None:
    populate(client)
    doc = export(client)
    v1 = copy.deepcopy(doc)
    v1["format_version"] = 1
    for meal in v1["meals"]:
        del meal["special"]
        del meal["note"]
    result = restore(client, v1)
    assert result.status_code == 200, result.text
    assert result.json()["meals"] == 3
    assert normalised(export(client)) == normalised({**doc, "format_version": 5})


def test_note_is_trimmed_and_validated(client: TestClient) -> None:
    special_populate(client)
    doc = export(client)
    doc["meals"][0]["note"] = "   "
    assert restore(client, doc).status_code == 200
    assert all(m["note"] != "   " for m in export(client)["meals"])
    long = mutate(doc, lambda d: d["meals"][0].update(note="x" * 121))
    detail = code_of(restore(client, long))
    assert detail["code"] == "note_too_long"


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d["meals"][0].update(recipe_ref=1, special="free"),
        lambda d: d["meals"][0].update(recipe_ref=None, special=None),
    ],
)
def test_meal_needs_exactly_one_of_recipe_and_special(client: TestClient, change: Any) -> None:
    special_populate(client)
    bad = mutate(export(client), change)
    assert code_of(restore(client, bad))["code"] == "meal_needs_recipe_or_special"


def test_unknown_special_is_invalid(client: TestClient) -> None:
    special_populate(client)
    bad = mutate(
        export(client), lambda d: d["meals"][1].update(recipe_ref=None, special="takeaway")
    )
    assert code_of(restore(client, bad))["code"] == "invalid_document"


def test_v3_round_trip_keeps_new_recipe_fields(client: TestClient) -> None:
    make(
        client,
        "Stew",
        servings=4,
        steps=["Chop", "  ", "Simmer"],
        source_url="https://example.com/stew",
    )
    doc = export(client)
    assert doc["recipes"][0]["steps"] == ["Chop", "Simmer"]
    assert restore(client, doc).status_code == 200
    again = export(client)["recipes"][0]
    assert (again["servings"], again["steps"], again["source_url"]) == (
        4,
        ["Chop", "Simmer"],
        "https://example.com/stew",
    )


def test_v2_backup_without_new_fields_is_restored_with_defaults(client: TestClient) -> None:
    make(client, "Stew")
    doc = export(client)
    doc["format_version"] = 2
    for recipe in doc["recipes"]:
        for key in ("servings", "steps", "source_url"):
            del recipe[key]
    assert restore(client, doc).status_code == 200
    recipe = export(client)["recipes"][0]
    assert (recipe["servings"], recipe["steps"], recipe["source_url"]) == (None, [], None)


def test_v4_round_trip_keeps_the_pantry(client: TestClient) -> None:
    populate(client)
    client.post("/api/pantry", json={"name": "Aceite de oliva"})
    doc = export(client)
    assert doc["pantry"] == [{"name": "Aceite de oliva"}, {"name": "Sal"}]
    client.post("/api/pantry", json={"name": "Ajo"})
    assert restore(client, doc).status_code == 200
    assert [i["name"] for i in client.get("/api/pantry").json()["items"]] == [
        "Aceite de oliva",
        "Sal",
    ]
    shopping = client.get(f"/api/weeks/{MONDAY}/shopping-list").json()["items"]
    assert {i["key"]: i["in_pantry"] for i in shopping} == {"sal": True, "tomate": False}


def test_v3_backup_restores_with_an_empty_pantry(client: TestClient) -> None:
    populate(client)
    doc = export(client)
    doc["format_version"] = 3
    del doc["pantry"]
    result = restore(client, doc)
    assert result.status_code == 200, result.text
    assert result.json()["pantry"] == 0
    assert client.get("/api/pantry").json()["items"] == []


SETTINGS = {
    "required_properties": ["vegetarian"],
    "avoided_properties": ["spicy"],
    "max_meals_per_protein": 3,
    "min_vegetarian_meals": 0,
    "min_fish_meals": 1,
    "lunch_time": "13:30",
    "dinner_time": "22:00",
}


def test_v5_round_trip_keeps_the_household_settings(client: TestClient) -> None:
    populate(client)
    assert client.put("/api/settings/household", json=SETTINGS).status_code == 200
    doc = export(client)
    assert doc["settings"] == SETTINGS
    client.put("/api/settings/household", json={**SETTINGS, "required_properties": []})
    assert restore(client, doc).status_code == 200
    assert client.get("/api/settings/household").json() == SETTINGS
    assert export(client)["settings"] == SETTINGS


def test_export_of_fresh_database_has_default_settings(client: TestClient) -> None:
    assert export(client)["settings"]["max_meals_per_protein"] == 4


def test_v4_backup_resets_the_settings_to_defaults(client: TestClient) -> None:
    populate(client)
    doc = export(client)
    doc["format_version"] = 4
    del doc["settings"]
    client.put("/api/settings/household", json=SETTINGS)
    result = restore(client, doc)
    assert result.status_code == 200, result.text
    assert client.get("/api/settings/household").json() == {
        "required_properties": [],
        "avoided_properties": [],
        "max_meals_per_protein": 4,
        "min_vegetarian_meals": 2,
        "min_fish_meals": 2,
        "lunch_time": "14:00",
        "dinner_time": "21:00",
    }


@pytest.mark.parametrize(
    "change",
    [
        {"lunch_time": "99:00"},
        {"required_properties": ["spicy"]},
        {"required_properties": ["vegan"], "avoided_properties": ["vegan"]},
    ],
)
def test_inconsistent_settings_are_rejected(client: TestClient, change: dict[str, Any]) -> None:
    doc = valid_doc(client)
    doc["settings"] = {**SETTINGS, **change}
    assert code_of(restore(client, doc))["code"] == "invalid_settings"


def test_out_of_range_settings_are_an_invalid_document(client: TestClient) -> None:
    doc = valid_doc(client)
    doc["settings"] = {**SETTINGS, "max_meals_per_protein": 0}
    assert code_of(restore(client, doc))["code"] == "invalid_document"
