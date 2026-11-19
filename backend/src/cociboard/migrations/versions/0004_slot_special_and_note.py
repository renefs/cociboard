"""Special meals and slot notes (v0.13.0): nullable ``recipe_id``, ``special`` and ``note``.

A slot holds a recipe or a special meal (exactly one, enforced by a CHECK constraint).
SQLite cannot alter these in place, so the table is rebuilt with batch operations; the
foreign key, the indexes and ``uq_week_day_slot`` are reflected and kept.

Revision ID: 0004_slot_special_and_note
Revises: 0003_recipe_archived_at
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_slot_special_and_note"
down_revision: str | None = "0003_recipe_archived_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CHECK_NAME = "ck_meal_recipe_or_special"


def upgrade() -> None:
    # Databases stamped from a create_all schema may already have the columns.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("mealassignment")}
    if "special" in columns:
        return
    with op.batch_alter_table("mealassignment", recreate="always") as batch:
        batch.alter_column("recipe_id", existing_type=sa.Integer(), nullable=True)
        batch.add_column(sa.Column("special", sa.String(), nullable=True))
        batch.add_column(sa.Column("note", sa.String(length=120), nullable=True))
        batch.create_check_constraint(CHECK_NAME, "(recipe_id IS NULL) <> (special IS NULL)")


def downgrade() -> None:
    op.execute("DELETE FROM mealassignment WHERE special IS NOT NULL")
    with op.batch_alter_table("mealassignment", recreate="always") as batch:
        batch.drop_constraint(CHECK_NAME, type_="check")
        batch.drop_column("note")
        batch.drop_column("special")
        batch.alter_column("recipe_id", existing_type=sa.Integer(), nullable=False)
