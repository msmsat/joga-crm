"""Отменённое занятие убирается из Журнала, а не из базы.

«Удалить навсегда» у отменённого занятия стирало строку вместе с отменёнными
бронями — и с ними пропадала история: клиент терял запись «занятие отменено
студией», отчёты недосчитывались отмен. Теперь кнопка ставит отметку
`hidden_at`, и сетка Журнала такое занятие просто не рисует.

У существующих занятий — NULL: все они видны, как и были.

Revision ID: 747b0ea5fea5
Revises: 321c22b45cec
Create Date: 2026-10-07
"""
from alembic import op
import sqlalchemy as sa

revision = "747b0ea5fea5"
down_revision = "321c22b45cec"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lessons", sa.Column("hidden_at", sa.DateTime(timezone=False), nullable=True))


def downgrade() -> None:
    op.drop_column("lessons", "hidden_at")
