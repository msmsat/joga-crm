"""Свой цвет у каждого сотрудника студии.

  * studio_members.color — цвет человека в этой студии: им окрашены его
    колонка и занятия в журнале. Раньше цвет вычислялся на лету как
    `id % 5`, и мастера то и дело совпадали.

Существующим участникам цвета здесь НЕ раздаются: это делает сам сервер при
первом чтении команды (`services.members.fill_missing_colors` в GET /staff/) —
без повторов внутри студии, сперва тренерам. Правило одно на всё: и на старые
строки, и на заведённые в обход роутеров (сиды), — копии в миграции не нужно.

Revision ID: a74771fbf697
Revises: 7c66830758a2
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa

revision = "a74771fbf697"
down_revision = "7c66830758a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("studio_members", sa.Column("color", sa.String(length=7), nullable=True))


def downgrade() -> None:
    op.drop_column("studio_members", "color")
