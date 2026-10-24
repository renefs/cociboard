"""API schemas. The frontend mirrors these in ``frontend/src/api/types.ts``."""

from datetime import date, datetime
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from cociboard.domain import IssueKind, IssueSeverity, MealSlot, MealType, Protein, RecipeProperty


class HealthResponse(BaseModel):
    """Response of ``GET /api/health``."""

    status: str
    version: str


RecipeName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


def _clean_ingredients(values: list[str]) -> list[str]:
    cleaned = [item.strip() for item in values]
    if not cleaned or any(not item for item in cleaned):
        raise ValueError("ingredients must be a non-empty list of non-empty strings")
    return cleaned


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

    @field_validator("ingredients")
    @classmethod
    def _ingredients(cls, value: list[str]) -> list[str]:
        return _clean_ingredients(value)

    @field_validator("properties")
    @classmethod
    def _properties(cls, value: list[RecipeProperty]) -> list[RecipeProperty]:
        return _dedupe(value)

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


_REQUIRED_ON_UPDATE = frozenset({"name", "meal_type", "protein", "ingredients", "properties"})


class RecipeUpdate(BaseModel):
    """Body of ``PATCH /api/recipes/{id}``. Only fields that are sent are changed."""

    name: RecipeName | None = None
    description: str | None = None
    meal_type: MealType | None = None
    protein: Protein | None = None
    prep_minutes: int | None = Field(default=None, gt=0)
    ingredients: list[str] | None = Field(default=None, min_length=1)
    properties: list[RecipeProperty] | None = None

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
    created_at: datetime


class SlotAssign(BaseModel):
    """Body of ``PUT /api/weeks/{week_start}/days/{day}/{slot}``."""

    recipe_id: int


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
    message: str
    slots: list[SlotPosition]


class VarietyReport(BaseModel):
    """Variety analysis of a week plan. ``score`` is null while the plan is empty."""

    score: int | None = Field(ge=0, le=100)
    filled_slots: int
    issues: list[VarietyIssue]
    protein_counts: dict[Protein, int]


class SlotFill(BaseModel):
    """One slot of a whole-week replacement."""

    day: int = Field(ge=0, le=6)
    slot: MealSlot
    recipe_id: int


class WeekReplace(BaseModel):
    """Body of ``PUT /api/weeks/{week_start}``: the complete new plan of the week."""

    slots: list[SlotFill]


class SuggestRequest(BaseModel):
    """Optional body of ``POST /api/weeks/{week_start}/suggest``."""

    seed: int | None = None


class CandidateRead(BaseModel):
    """A recipe that fits a slot, with the effect it would have on variety."""

    recipe: RecipeRead
    score_delta: int
    reason: str
    good_pick: bool


class DayPlanRead(BaseModel):
    """One day of a week plan."""

    day: int
    date: date
    lunch: RecipeRead | None
    dinner: RecipeRead | None


class WeekPlanRead(BaseModel):
    """A full week: seven days from Monday."""

    week_start: date
    days: list[DayPlanRead]
    variety: VarietyReport
