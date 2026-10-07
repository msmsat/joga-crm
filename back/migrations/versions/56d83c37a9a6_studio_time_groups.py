"""«Время студии» на нескольких сотрудников: общий ключ блоков.

Планёрку ставят всей команде одним окном. В базе это по интервалу занятости
на каждого — так их и дальше вычитают онлайн-запись и проверки расписания, —
а связывает их общий group_key: перенос, переименование и удаление идут по
всей группе, и окно правки показывает, кого блок касается.

У прежних блоков ключа нет — каждый остаётся группой из себя самого.

Revision ID: 56d83c37a9a6
Revises: 747b0ea5fea5
Create Date: 2026-10-07
"""
from alembic import op
import sqlalchemy as sa

revision = "56d83c37a9a6"
down_revision = "747b0ea5fea5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_busy_intervals", sa.Column("group_key", sa.String(32), nullable=True))
    op.create_index("ix_staff_busy_interval_group", "staff_busy_intervals", ["studio_id", "group_key"])


def downgrade() -> None:
    op.drop_index("ix_staff_busy_interval_group", table_name="staff_busy_intervals")
    op.drop_column("staff_busy_intervals", "group_key")
