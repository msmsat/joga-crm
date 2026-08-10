"""отметки «работает / выходной» на конкретную дату

Поверх недельного графика сотрудника (`staff_working_hours`). Строки нет —
день считается по недельному графику, поэтому снятие отметки удаляет строку.

Revision ID: f2b7c4e91a05
Revises: c4a1e9d70b28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2b7c4e91a05"
down_revision: Union[str, Sequence[str], None] = "c4a1e9d70b28"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staff_day_overrides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("studio_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("is_working", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["studio_id"], ["studios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "studio_id", "day", name="uq_staff_studio_date"),
    )
    op.create_index("ix_staff_day_overrides_user_id", "staff_day_overrides", ["user_id"])
    op.create_index("ix_staff_day_overrides_studio_id", "staff_day_overrides", ["studio_id"])


def downgrade() -> None:
    op.drop_index("ix_staff_day_overrides_studio_id", table_name="staff_day_overrides")
    op.drop_index("ix_staff_day_overrides_user_id", table_name="staff_day_overrides")
    op.drop_table("staff_day_overrides")
