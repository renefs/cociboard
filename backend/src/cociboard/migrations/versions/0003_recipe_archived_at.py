"""Archived recipes (v0.11.0): nullable ``recipe.archived_at``.

Revision ID: 0003_recipe_archived_at
Revises: 0002_shopping_list
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_recipe_archived_at"
down_revision: str | None = "0002_shopping_list"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Databases stamped from a create_all schema may already have the column.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("recipe")}
    if "archived_at" not in columns:
        with op.batch_alter_table("recipe") as batch:
            batch.add_column(sa.Column("archived_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("recipe") as batch:
        batch.drop_column("archived_at")
