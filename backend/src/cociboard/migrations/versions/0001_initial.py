"""Initial schema (v0.8.0): recipes and meal assignments.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipe",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("meal_type", sa.String(length=6), nullable=False),
        sa.Column("protein", sa.String(length=7), nullable=False),
        sa.Column("prep_minutes", sa.Integer(), nullable=True),
        sa.Column("ingredients", sa.JSON(), nullable=False),
        sa.Column("properties", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipe_name", "recipe", ["name"], unique=True)
    op.create_table(
        "mealassignment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("slot", sa.String(length=6), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipe.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("week_start", "day", "slot", name="uq_week_day_slot"),
    )
    op.create_index("ix_mealassignment_recipe_id", "mealassignment", ["recipe_id"])
    op.create_index("ix_mealassignment_week_start", "mealassignment", ["week_start"])


def downgrade() -> None:
    op.drop_index("ix_mealassignment_week_start", table_name="mealassignment")
    op.drop_index("ix_mealassignment_recipe_id", table_name="mealassignment")
    op.drop_table("mealassignment")
    op.drop_index("ix_recipe_name", table_name="recipe")
    op.drop_table("recipe")
