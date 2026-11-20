"""Richer recipes (v0.17.0): ``servings``, ``steps`` (JSON list) and ``source_url``.

Existing rows get ``steps = '[]'`` through the server default.

Revision ID: 0005_recipe_steps_servings_source
Revises: 0004_slot_special_and_note
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_recipe_steps_servings_source"
down_revision: str | None = "0004_slot_special_and_note"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Databases stamped from a create_all schema may already have the columns.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("recipe")}
    with op.batch_alter_table("recipe") as batch:
        if "servings" not in columns:
            batch.add_column(sa.Column("servings", sa.Integer(), nullable=True))
        if "steps" not in columns:
            batch.add_column(
                sa.Column("steps", sa.JSON(), nullable=False, server_default=sa.text("'[]'"))
            )
        if "source_url" not in columns:
            batch.add_column(sa.Column("source_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("recipe") as batch:
        batch.drop_column("source_url")
        batch.drop_column("steps")
        batch.drop_column("servings")
