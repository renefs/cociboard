"""Database table models. API schemas live in ``schemas.py``."""

from datetime import UTC, date, datetime

from sqlalchemy import JSON, CheckConstraint, Column, UniqueConstraint
from sqlmodel import Field, SQLModel

from cociboard.domain import NOTE_MAX_LENGTH, MealSlot, MealType, Protein
from cociboard.household import (
    DEFAULT_DINNER_TIME,
    DEFAULT_LUNCH_TIME,
    DEFAULT_MAX_MEALS_PER_PROTEIN,
    DEFAULT_MIN_FISH_MEALS,
    DEFAULT_MIN_VEGETARIAN_MEALS,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Recipe(SQLModel, table=True):
    """A recipe row. ``ingredients``, ``properties`` and ``steps`` are stored as JSON lists."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=80, unique=True, index=True)
    description: str | None = Field(default=None)
    meal_type: MealType
    protein: Protein
    prep_minutes: int | None = Field(default=None)
    ingredients: list[str] = Field(sa_column=Column(JSON, nullable=False))
    properties: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    servings: int | None = Field(default=None)
    steps: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    source_url: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=_utcnow)
    # Set when the recipe is archived: hidden from the catalogue and suggestions, kept in plans.
    archived_at: datetime | None = Field(default=None)


class MealAssignment(SQLModel, table=True):
    """A meal placed in one slot of one week: a recipe or a special meal, plus an optional note.

    ``week_start`` is always a Monday. Exactly one of ``recipe_id`` and ``special`` is set.
    """

    __table_args__ = (
        UniqueConstraint("week_start", "day", "slot", name="uq_week_day_slot"),
        CheckConstraint(
            "(recipe_id IS NULL) <> (special IS NULL)", name="ck_meal_recipe_or_special"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    week_start: date = Field(index=True)
    day: int  # 0 = Monday ... 6 = Sunday
    slot: MealSlot
    recipe_id: int | None = Field(default=None, foreign_key="recipe.id", index=True)
    special: str | None = Field(default=None)  # a ``SpecialMeal`` value
    note: str | None = Field(default=None, max_length=NOTE_MAX_LENGTH)


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


class PantryItem(SQLModel, table=True):
    """A staple the household always has at home (global, not per week).

    ``key`` is the ``ingredient_key`` of ``name``; shopping items whose key matches exactly
    are listed as "in the pantry" instead of "to buy".
    """

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(max_length=200, unique=True, index=True)
    name: str = Field(max_length=80)
    created_at: datetime = Field(default_factory=_utcnow)


class HouseholdSettingsRow(SQLModel, table=True):
    """The household preferences: one row, ``id`` always 1 (ADR-0026).

    The row is created by the first save; until then the defaults apply. The property lists
    hold ``RecipeProperty`` values as JSON.
    """

    __tablename__ = "household_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_household_settings_single_row"),)

    id: int = Field(default=1, primary_key=True)
    required_properties: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    avoided_properties: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    max_meals_per_protein: int = DEFAULT_MAX_MEALS_PER_PROTEIN
    min_vegetarian_meals: int = DEFAULT_MIN_VEGETARIAN_MEALS
    min_fish_meals: int = DEFAULT_MIN_FISH_MEALS
    lunch_time: str = Field(default=DEFAULT_LUNCH_TIME, max_length=5)
    dinner_time: str = Field(default=DEFAULT_DINNER_TIME, max_length=5)
