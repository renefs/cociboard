"""Database table models. API schemas live in ``schemas.py``."""

from datetime import UTC, datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from cociboard.domain import MealType, Protein


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Recipe(SQLModel, table=True):
    """A recipe row. ``ingredients`` and ``properties`` are stored as JSON lists."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=80, unique=True, index=True)
    description: str | None = Field(default=None)
    meal_type: MealType
    protein: Protein
    prep_minutes: int | None = Field(default=None)
    ingredients: list[str] = Field(sa_column=Column(JSON, nullable=False))
    properties: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=_utcnow)
