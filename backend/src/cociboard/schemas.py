"""API schemas. The frontend mirrors these in ``frontend/src/api/types.ts``."""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
    field_validator,
    model_validator,
)

from cociboard.domain import (
    NOTE_MAX_LENGTH,
    SERVINGS_MAX,
    SERVINGS_MIN,
    CandidateReason,
    IssueKind,
    IssueSeverity,
    MealSlot,
    MealType,
    Protein,
    RecipeProperty,
    SpecialMeal,
    clean_source_url,
    clean_steps,
)
from cociboard.household import (
    DEFAULT_DINNER_TIME,
    DEFAULT_LUNCH_TIME,
    DEFAULT_MAX_MEALS_PER_PROTEIN,
    DEFAULT_MIN_FISH_MEALS,
    DEFAULT_MIN_VEGETARIAN_MEALS,
)
from cociboard.recipe_import.parse import ImportWarningCode


class HealthResponse(BaseModel):
    """Response of ``GET /api/health``."""

    status: str
    version: str


class AuthStatus(BaseModel):
    """Response of ``GET /api/auth/status``."""

    enabled: bool
    authenticated: bool
    # Auth is off and the request comes from a public address.
    exposed: bool


class LoginRequest(BaseModel):
    """Body of ``POST /api/auth/login``."""

    password: str = Field(max_length=1024)


RecipeName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


def _clean_ingredients(values: list[str]) -> list[str]:
    cleaned = [item.strip() for item in values]
    if not cleaned or any(not item for item in cleaned):
        raise ValueError("ingredients must be a non-empty list of non-empty strings")
    return cleaned


def _clean_steps_optional(values: list[str] | None) -> list[str] | None:
    return None if values is None else clean_steps(values)


def _dedupe(values: list[RecipeProperty]) -> list[RecipeProperty]:
    return list(dict.fromkeys(values))


class RecipeCreate(BaseModel):
    """Body of ``POST /api/recipes``."""

    name: RecipeName
    description: str | None = None
    meal_type: MealType
    protein: Protein
    prep_minutes: int | None = Field(default=None, gt=0)
    ingredients: list[str] = Field(min_length=1)
    properties: list[RecipeProperty] = Field(default_factory=list)
    servings: int | None = Field(default=None, ge=SERVINGS_MIN, le=SERVINGS_MAX)
    steps: list[str] = Field(default_factory=list)
    source_url: str | None = None

    @field_validator("ingredients")
    @classmethod
    def _ingredients(cls, value: list[str]) -> list[str]:
        return _clean_ingredients(value)

    @field_validator("steps")
    @classmethod
    def _steps(cls, value: list[str]) -> list[str]:
        return clean_steps(value)

    @field_validator("source_url")
    @classmethod
    def _source_url(cls, value: str | None) -> str | None:
        return clean_source_url(value)

    @field_validator("properties")
    @classmethod
    def _properties(cls, value: list[RecipeProperty]) -> list[RecipeProperty]:
        return _dedupe(value)

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


_REQUIRED_ON_UPDATE = frozenset(
    {"name", "meal_type", "protein", "ingredients", "properties", "steps", "archived"}
)


class RecipeUpdate(BaseModel):
    """Body of ``PATCH /api/recipes/{id}``. Only fields that are sent are changed."""

    name: RecipeName | None = None
    description: str | None = None
    meal_type: MealType | None = None
    protein: Protein | None = None
    prep_minutes: int | None = Field(default=None, gt=0)
    ingredients: list[str] | None = Field(default=None, min_length=1)
    properties: list[RecipeProperty] | None = None
    # ``null`` clears the optional fields (description, prep_minutes, servings, source_url).
    servings: int | None = Field(default=None, ge=SERVINGS_MIN, le=SERVINGS_MAX)
    steps: list[str] | None = None
    source_url: str | None = None
    archived: bool | None = None

    @field_validator("steps")
    @classmethod
    def _steps(cls, value: list[str] | None) -> list[str] | None:
        return _clean_steps_optional(value)

    @field_validator("source_url")
    @classmethod
    def _source_url(cls, value: str | None) -> str | None:
        return clean_source_url(value)

    @field_validator("ingredients")
    @classmethod
    def _ingredients(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _clean_ingredients(value)

    @field_validator("properties")
    @classmethod
    def _properties(cls, value: list[RecipeProperty] | None) -> list[RecipeProperty] | None:
        return None if value is None else _dedupe(value)

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @model_validator(mode="after")
    def _no_null_required(self) -> Self:
        for key in _REQUIRED_ON_UPDATE & self.model_fields_set:
            if getattr(self, key) is None:
                raise ValueError(f"{key} cannot be null")
        return self

    def changes(self) -> dict[str, object]:
        """Return the explicitly sent fields."""
        return self.model_dump(exclude_unset=True)


class RecipeRead(BaseModel):
    """Recipe as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    meal_type: MealType
    protein: Protein
    prep_minutes: int | None
    ingredients: list[str]
    properties: list[RecipeProperty]
    servings: int | None
    steps: list[str]
    source_url: str | None
    created_at: datetime
    archived_at: datetime | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]  # pydantic documents this pattern
    @property
    def archived(self) -> bool:
        """Whether the recipe is archived (hidden from the catalogue, kept in plans)."""
        return self.archived_at is not None


class RecipeImportRequest(BaseModel):
    """Body of ``POST /api/recipes/import``."""

    url: str


class RecipeDraft(BaseModel):
    """Response of ``POST /api/recipes/import``: fields to review in the form; nothing is saved."""

    name: str
    description: str | None
    servings: int | None
    prep_minutes: int | None
    ingredients: list[str]
    steps: list[str]
    source_url: str | None
    warnings: list[ImportWarningCode]


class RecipeUsage(BaseModel):
    """Response of ``GET /api/recipes/{id}/usage``: planned slots using the recipe."""

    count: int


class ConflictSlot(BaseModel):
    """A planned slot that conflicts with a recipe edit."""

    week_start: date
    day: int
    slot: MealSlot


class MealTypeConflictDetail(BaseModel):
    """The ``detail`` of the 409 returned when a meal-type change breaks planned meals."""

    code: Literal["meal_type_conflict"] = "meal_type_conflict"
    message: str
    conflicts: list[ConflictSlot]


class DuplicateNameDetail(BaseModel):
    """The ``detail`` of the 409 returned when a recipe name is already taken."""

    code: Literal["duplicate_name"] = "duplicate_name"
    message: str
    archived: bool  # the existing recipe is archived: the client explains how to restore it


class RecipeArchivedDetail(BaseModel):
    """The ``detail`` of the 422 returned when an archived recipe is assigned to a slot."""

    code: Literal["recipe_archived"] = "recipe_archived"
    message: str
    recipe_id: int


def clean_note(value: str | None) -> str | None:
    """Trim a note; an empty one becomes ``None``. Raises when it is longer than 120 characters."""
    if value is None:
        return None
    cleaned = value.strip()
    if len(cleaned) > NOTE_MAX_LENGTH:
        raise ValueError(f"note must be at most {NOTE_MAX_LENGTH} characters")
    return cleaned or None


Note = Annotated[str | None, AfterValidator(clean_note)]


class MealContent(BaseModel):
    """What a slot holds: exactly one of ``recipe_id`` and ``special``, plus an optional note."""

    recipe_id: int | None = None
    special: SpecialMeal | None = None
    note: Note = None

    @model_validator(mode="after")
    def _exactly_one(self) -> Self:
        if (self.recipe_id is None) == (self.special is None):
            raise ValueError("exactly one of recipe_id and special is required")
        return self


class SlotAssign(MealContent):
    """Body of ``PUT /api/weeks/{week_start}/days/{day}/{slot}``.

    The note sent is the note stored (omitted means none); clients send the existing note
    when it should be kept.
    """


class NoteSet(BaseModel):
    """Body of ``PATCH /api/weeks/{week_start}/days/{day}/{slot}/note``."""

    note: Note


class SlotMove(BaseModel):
    """Body of ``POST /api/weeks/{week_start}/move``."""

    from_day: int = Field(ge=0, le=6)
    from_slot: MealSlot
    to_day: int = Field(ge=0, le=6)
    to_slot: MealSlot


class SlotPosition(BaseModel):
    """A slot of the weekly grid."""

    day: int
    slot: MealSlot


class VarietyIssue(BaseModel):
    """One finding of the variety analysis."""

    kind: IssueKind
    severity: IssueSeverity
    message: str  # English, not localised: clients translate from ``kind`` and ``params``
    slots: list[SlotPosition]
    # Values for the message template of ``kind``; see ``variety.py`` for the keys.
    params: dict[str, str | int | SlotPosition] = Field(default_factory=dict)


class VarietyReport(BaseModel):
    """Variety analysis of a week plan. ``score`` is null while the plan is empty."""

    score: int | None = Field(ge=0, le=100)
    filled_slots: int
    issues: list[VarietyIssue]
    protein_counts: dict[Protein, int]


class SlotFill(MealContent):
    """One slot of a whole-week replacement."""

    day: int = Field(ge=0, le=6)
    slot: MealSlot


class WeekReplace(BaseModel):
    """Body of ``PUT /api/weeks/{week_start}``: the complete new plan of the week."""

    slots: list[SlotFill]


class SuggestRequest(BaseModel):
    """Optional body of ``POST /api/weeks/{week_start}/suggest``."""

    seed: int | None = None


class WeekCopyRequest(BaseModel):
    """Body of ``POST /api/weeks/{week_start}/copy``."""

    from_week_start: date


class CandidateRead(BaseModel):
    """A recipe that fits a slot, with the effect it would have on variety."""

    recipe: RecipeRead
    score_delta: int
    reason: str  # English, not localised: clients translate from ``reason_code``
    reason_code: CandidateReason
    reason_params: dict[str, str | int] = Field(default_factory=dict)
    good_pick: bool


class DayPlanRead(BaseModel):
    """One day of a week plan."""

    day: int
    date: date
    lunch: RecipeRead | None
    dinner: RecipeRead | None
    # A slot holds a recipe or a special meal, never both (additive to ``lunch``/``dinner``).
    lunch_special: SpecialMeal | None = None
    dinner_special: SpecialMeal | None = None
    lunch_note: str | None = None
    dinner_note: str | None = None


class WeekPlanRead(BaseModel):
    """A full week: seven days from Monday."""

    week_start: date
    days: list[DayPlanRead]
    variety: VarietyReport


class WeekCopyRead(BaseModel):
    """Result of copying a week: the target plan and what happened."""

    plan: WeekPlanRead
    copied: int
    skipped_archived: int  # meals left out because their recipe is archived
    source_meals: int  # meals in the source week (0 means there was nothing to copy)


class ShoppingMealRead(BaseModel):
    """A planned meal that uses a shopping item."""

    day: int
    slot: MealSlot
    recipe_id: int
    recipe_name: str


class ShoppingItemRead(BaseModel):
    """An ingredient of the week, grouped by its folded name."""

    key: str
    name: str
    checked: bool
    in_pantry: bool = False  # its key matches a pantry item (extras are never pantry items)
    meals: list[ShoppingMealRead]


ExtraName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class ShoppingExtraRead(BaseModel):
    """An item added by hand."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    checked: bool


class ShoppingListRead(BaseModel):
    """The shopping list of a week: generated items plus manual extras (creation order)."""

    week_start: date
    items: list[ShoppingItemRead]
    extras: list[ShoppingExtraRead]


class ShoppingCheckSet(BaseModel):
    """Body of ``PUT /api/weeks/{week_start}/shopping-list/checks``."""

    key: str = Field(min_length=1, max_length=200)
    checked: bool


class ShoppingExtraCreate(BaseModel):
    """Body of ``POST /api/weeks/{week_start}/shopping-list/extras``."""

    name: ExtraName


class ShoppingExtraUpdate(BaseModel):
    """Body of ``PATCH .../shopping-list/extras/{id}``. Only sent fields change."""

    name: ExtraName | None = None
    checked: bool | None = None

    @model_validator(mode="after")
    def _no_null(self) -> Self:
        for key in {"name", "checked"} & self.model_fields_set:
            if getattr(self, key) is None:
                raise ValueError(f"{key} cannot be null")
        return self


class PantryCreate(BaseModel):
    """Body of ``POST /api/pantry``."""

    name: ExtraName


class PantryItemRead(BaseModel):
    """A pantry staple."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str


class PantrySuggestionRead(BaseModel):
    """An ingredient used by many active recipes, offered as a staple."""

    key: str
    name: str
    recipe_count: int


class PantryRead(BaseModel):
    """Response of ``GET /api/pantry``: items sorted by key plus suggestions."""

    items: list[PantryItemRead]
    suggestions: list[PantrySuggestionRead]


class HouseholdSettings(BaseModel):
    """Household preferences, as read and as written (``/api/settings/household``).

    Cross-field and time checks live in ``household.validate_household`` and answer with
    a ``{"detail": {"code": ...}}`` 422.
    """

    required_properties: list[RecipeProperty] = []
    avoided_properties: list[RecipeProperty] = []
    max_meals_per_protein: Annotated[int, Field(ge=1, le=14)] = DEFAULT_MAX_MEALS_PER_PROTEIN
    min_vegetarian_meals: Annotated[int, Field(ge=0, le=14)] = DEFAULT_MIN_VEGETARIAN_MEALS
    min_fish_meals: Annotated[int, Field(ge=0, le=14)] = DEFAULT_MIN_FISH_MEALS
    lunch_time: Annotated[str, Field(max_length=5)] = DEFAULT_LUNCH_TIME
    dinner_time: Annotated[str, Field(max_length=5)] = DEFAULT_DINNER_TIME


BackupErrorCode = Literal["disk_full", "permission_denied", "unknown"]


class BackupFailureInfo(BaseModel):
    """The last failed automatic copy: when, and a code (no raw error text)."""

    at: datetime
    code: BackupErrorCode


class BackupStatus(BaseModel):
    """Automatic database copies (``GET /api/backup/status``)."""

    enabled: bool
    interval_hours: int
    kept: int
    last_backup_at: datetime | None
    copies: int
    last_error: BackupFailureInfo | None
    custom_dir: bool
