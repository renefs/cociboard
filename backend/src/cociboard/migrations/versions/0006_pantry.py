"""Pantry staples (v0.20.0): a global ``pantryitem`` table.

Revision ID: 0006_pantry
Revises: 0005_recipe_steps_servings_source
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_pantry"
down_revision: str | None = "0005_recipe_steps_servings_source"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pantryitem",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=200), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pantryitem_key", "pantryitem", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_pantryitem_key", table_name="pantryitem")
    op.drop_table("pantryitem")
