"""Backup document format (v4; v1 to v3 are still accepted): schema and pure validation.

Persistence is in ``backup_repo``.

The document is plain JSON that links meals to recipes through ``ref`` (the source recipe id,
meaningless after a restore). Validation never touches the database: a restore parses and
checks the whole document first, and only then replaces the data.
"""

from collections import Counter
from datetime import UTC, date, datetime
from typing import Final, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from cociboard.domain import (
    NOTE_MAX_LENGTH,
    MealSlot,
    SpecialMeal,
    fits_slot,
    is_valid_day_index,
    is_week_start,
)
from cociboard.schemas import ExtraName, RecipeCreate
from cociboard.shopping import ingredient_key

BACKUP_FORMAT: Final = "cociboard-backup"
SUPPORTED_FORMAT_VERSION = 4  # the version written by export
READABLE_FORMAT_VERSIONS = frozenset(
    {1, 2, 3, 4}
)  # v1 meals have a recipe_ref; v1/v2 recipes lack the v3 fields; v1-v3 have no pantry
MAX_BACKUP_BYTES = 10 * 1024 * 1024


class BackupValidationError(Exception):
    """The document is not a valid backup. ``code`` and ``params`` are for the client."""

    def __init__(self, code: str, **params: str | int) -> None:
        super().__init__(code)
        self.code = code
        self.params = params


def _aware_utc(value: datetime) -> datetime:
    """Timestamps are stored as UTC; a value without offset is taken to be UTC."""
    return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)


class BackupRecipe(RecipeCreate):
    """A recipe of the backup: the usual recipe rules plus its archive state and timestamp."""

    ref: int
    archived: bool = False
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def _created_at(cls, value: datetime) -> datetime:
        return _aware_utc(value)


class BackupMeal(BaseModel):
    """One planned slot: a recipe (by ``recipe_ref``) or a ``special`` meal, plus a note.

    v1 documents only have ``recipe_ref``. Exactly one of the two is required.
    """

    week_start: date
    day: int
    slot: MealSlot
    recipe_ref: int | None = None
    special: SpecialMeal | None = None
    note: str | None = None

    @field_validator("note")
    @classmethod
    def _note(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class BackupShoppingCheck(BaseModel):
    """A ticked generated shopping item."""

    week_start: date
    item_key: str = Field(min_length=1, max_length=200)


class BackupShoppingExtra(BaseModel):
    """A hand-added shopping item."""

    week_start: date
    name: ExtraName
    checked: bool
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def _created_at(cls, value: datetime) -> datetime:
        return _aware_utc(value)


class BackupPantryItem(BaseModel):
    """A pantry staple; the key is derived from the name on restore."""

    name: ExtraName


class BackupDocument(BaseModel):
    """The whole backup file."""

    model_config = ConfigDict(extra="ignore")

    format: Literal["cociboard-backup"] = BACKUP_FORMAT
    format_version: int = SUPPORTED_FORMAT_VERSION
    app_version: str
    exported_at: datetime
    recipes: list[BackupRecipe]
    meals: list[BackupMeal]
    shopping_checks: list[BackupShoppingCheck]
    shopping_extras: list[BackupShoppingExtra]
    pantry: list[BackupPantryItem] = []  # absent before v4


class RestoreResult(BaseModel):
    """Response of ``POST /api/backup/restore``: how many rows were restored."""

    recipes: int
    meals: int
    shopping_checks: int
    shopping_extras: int
    pantry: int


def _location(error: ValidationError) -> str:
    first = error.errors()[0]
    return ".".join(str(part) for part in first["loc"])


def _check_semantics(doc: BackupDocument) -> None:
    refs = Counter(recipe.ref for recipe in doc.recipes)
    for ref, count in refs.items():
        if count > 1:
            raise BackupValidationError("duplicate_recipe_ref", ref=ref)
    names = Counter(recipe.name.lower() for recipe in doc.recipes)
    for name, count in names.items():
        if count > 1:
            raise BackupValidationError("duplicate_recipe_name", name=name)
    by_ref = {recipe.ref: recipe for recipe in doc.recipes}
    seen: set[tuple[date, int, MealSlot]] = set()
    for meal in doc.meals:
        if not is_week_start(meal.week_start):
            raise BackupValidationError("invalid_week", week_start=meal.week_start.isoformat())
        if not is_valid_day_index(meal.day):
            raise BackupValidationError("invalid_day", day=meal.day)
        if (meal.recipe_ref is None) == (meal.special is None):
            raise BackupValidationError(
                "meal_needs_recipe_or_special",
                week_start=meal.week_start.isoformat(),
                day=meal.day,
                slot=meal.slot,
            )
        if meal.note is not None and len(meal.note) > NOTE_MAX_LENGTH:
            raise BackupValidationError("note_too_long", max=NOTE_MAX_LENGTH)
        if meal.recipe_ref is not None:
            recipe = by_ref.get(meal.recipe_ref)
            if recipe is None:
                raise BackupValidationError("unknown_recipe_ref", ref=meal.recipe_ref)
            if not fits_slot(recipe.meal_type, meal.slot):
                raise BackupValidationError("meal_does_not_fit", recipe=recipe.name, slot=meal.slot)
        key = (meal.week_start, meal.day, meal.slot)
        if key in seen:
            raise BackupValidationError(
                "duplicate_slot",
                week_start=meal.week_start.isoformat(),
                day=meal.day,
                slot=meal.slot,
            )
        seen.add(key)
    weeks = [c.week_start for c in doc.shopping_checks] + [
        e.week_start for e in doc.shopping_extras
    ]
    for week in weeks:
        if not is_week_start(week):
            raise BackupValidationError("invalid_week", week_start=week.isoformat())
    staple_keys: set[str] = set()
    for staple in doc.pantry:
        staple_key = ingredient_key(staple.name)
        if not staple_key:
            raise BackupValidationError("invalid_pantry_item", name=staple.name)
        if staple_key in staple_keys:
            raise BackupValidationError("duplicate_pantry_item", name=staple.name)
        staple_keys.add(staple_key)
    check_keys = Counter((c.week_start, c.item_key) for c in doc.shopping_checks)
    for (week, item_key), count in check_keys.items():
        if count > 1:
            raise BackupValidationError(
                "duplicate_shopping_check", week_start=week.isoformat(), item_key=item_key
            )


def parse_backup(data: object) -> BackupDocument:
    """Validate a decoded JSON document; raise :class:`BackupValidationError` with a code.

    Codes: ``invalid_document``, ``wrong_format``, ``unsupported_version``,
    ``duplicate_recipe_ref``, ``duplicate_recipe_name``, ``invalid_week``, ``invalid_day``,
    ``unknown_recipe_ref``, ``meal_does_not_fit``, ``meal_needs_recipe_or_special``,
    ``note_too_long``, ``duplicate_slot``, ``duplicate_shopping_check``,
    ``invalid_pantry_item``, ``duplicate_pantry_item``.
    """
    if not isinstance(data, dict):
        raise BackupValidationError("invalid_document")
    if data.get("format") != BACKUP_FORMAT:
        raise BackupValidationError("wrong_format")
    version = data.get("format_version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise BackupValidationError("invalid_document", path="format_version")
    if version not in READABLE_FORMAT_VERSIONS:
        raise BackupValidationError("unsupported_version", version=version)
    try:
        doc = BackupDocument.model_validate(data)
    except ValidationError as exc:
        raise BackupValidationError("invalid_document", path=_location(exc)) from None
    _check_semantics(doc)
    return doc
