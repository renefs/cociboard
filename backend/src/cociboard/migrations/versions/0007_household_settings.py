"""Household preferences (v0.23.0): the single-row ``household_settings`` table.

Revision ID: 0007_household_settings
Revises: 0006_pantry
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_household_settings"
down_revision: str | None = "0006_pantry"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "household_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("required_properties", sa.JSON(), nullable=False),
        sa.Column("avoided_properties", sa.JSON(), nullable=False),
        sa.Column("max_meals_per_protein", sa.Integer(), nullable=False),
        sa.Column("min_vegetarian_meals", sa.Integer(), nullable=False),
        sa.Column("min_fish_meals", sa.Integer(), nullable=False),
        sa.Column("lunch_time", sa.String(length=5), nullable=False),
        sa.Column("dinner_time", sa.String(length=5), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_household_settings_single_row"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("household_settings")
