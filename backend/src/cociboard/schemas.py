"""API schemas. The frontend mirrors these in ``frontend/src/api/types.ts``."""

from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from cociboard.domain import MealType, Protein, RecipeProperty


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
