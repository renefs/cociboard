"""Shopping list tables (v0.9.0).

v0.9.0 databases already have these tables (created by ``create_all`` before migrations
existed), so each table is only created when missing.

Revision ID: 0002_shopping_list
Revises: 0001_initial
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_shopping_list"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "shoppingcheck" not in existing:
        op.create_table(
            "shoppingcheck",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("week_start", sa.Date(), nullable=False),
            sa.Column("item_key", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("week_start", "item_key", name="uq_week_item_key"),
        )
        op.create_index("ix_shoppingcheck_week_start", "shoppingcheck", ["week_start"])
    if "shoppingextra" not in existing:
        op.create_table(
            "shoppingextra",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("week_start", sa.Date(), nullable=False),
            sa.Column("name", sa.String(length=80), nullable=False),
            sa.Column("checked", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_shoppingextra_week_start", "shoppingextra", ["week_start"])


def downgrade() -> None:
    op.drop_index("ix_shoppingextra_week_start", table_name="shoppingextra")
    op.drop_table("shoppingextra")
    op.drop_index("ix_shoppingcheck_week_start", table_name="shoppingcheck")
    op.drop_table("shoppingcheck")
