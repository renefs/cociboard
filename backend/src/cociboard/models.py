"""Database table models. API schemas live in ``schemas.py``."""

from datetime import UTC, date, datetime

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel

from cociboard.domain import MealSlot, MealType, Protein


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
    # Set when the recipe is archived: hidden from the catalogue and suggestions, kept in plans.
    archived_at: datetime | None = Field(default=None)


class MealAssignment(SQLModel, table=True):
    """A recipe placed in one slot of one week. ``week_start`` is always a Monday."""

    __table_args__ = (UniqueConstraint("week_start", "day", "slot", name="uq_week_day_slot"),)

    id: int | None = Field(default=None, primary_key=True)
    week_start: date = Field(index=True)
    day: int  # 0 = Monday ... 6 = Sunday
    slot: MealSlot
    recipe_id: int = Field(foreign_key="recipe.id", index=True)


class ShoppingCheck(SQLModel, table=True):
    """A generated shopping item ticked off for a week. Row present = checked."""

    __table_args__ = (UniqueConstraint("week_start", "item_key", name="uq_week_item_key"),)

    id: int | None = Field(default=None, primary_key=True)
    week_start: date = Field(index=True)
    item_key: str


class ShoppingExtra(SQLModel, table=True):
    """An item added by hand to the shopping list of a week."""

    id: int | None = Field(default=None, primary_key=True)
    week_start: date = Field(index=True)
    name: str = Field(max_length=80)
    checked: bool = False
    created_at: datetime = Field(default_factory=_utcnow)
