"""«О себе» мастера для клиентов.

Мини-приложение раскрывает карточку занятия и строку мастера: кто ведёт, чем
занимается, его средняя оценка. Оценку считает каталог из броней, а текст
пишет владелец в CRM → Сотрудники. Поле — на членстве, а не на аккаунте: у
человека, работающего в двух студиях, в каждой своя подача.

Revision ID: 9938de444e5d
Revises: d1af6bad7fa8
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa

revision = "9938de444e5d"
down_revision = "d1af6bad7fa8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("studio_members", sa.Column("bio", sa.String(length=600), nullable=True))


def downgrade() -> None:
    op.drop_column("studio_members", "bio")
