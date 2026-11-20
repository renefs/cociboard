"""Favourite recipes (v0.24.0): ``recipe.favourite``, false for existing rows.

Revision ID: 0008_recipe_favourite
Revises: 0007_household_settings
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_recipe_favourite"
down_revision: str | None = "0007_household_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("recipe") as batch:
        batch.add_column(
            sa.Column("favourite", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("recipe") as batch:
        batch.drop_column("favourite")
