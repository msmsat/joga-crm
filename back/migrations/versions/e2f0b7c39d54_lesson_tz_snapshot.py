"""lesson timezone snapshot

Revision ID: e2f0b7c39d54
Revises: d5e8a2c04f19
Create Date: 2026-08-26

Аддитивная и пустая по данным: одна nullable-колонка, БЕЗ бэкфилла.

Бэкфилл невозможен честно: у занятия, созданного до P1.2, стенное время
записано, а по какой зоне — неизвестно. Подставить сегодняшнюю зону студии
значило бы задним числом объявить точным момент, который никто не фиксировал.
NULL здесь — это ответ «момент неизвестен», и код обязан его различать.

Индекс не заводится: по снимку никто не фильтрует, отбор идёт по start_time,
на котором индексы уже есть.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e2f0b7c39d54'
down_revision = 'd5e8a2c04f19'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('lessons', sa.Column('tz_iana', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('lessons', 'tz_iana')
