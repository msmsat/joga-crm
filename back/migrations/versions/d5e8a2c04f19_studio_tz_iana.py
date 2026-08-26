"""studio IANA timezone

Revision ID: d5e8a2c04f19
Revises: c9b1f4a7d032
Create Date: 2026-08-26

Аддитивная и пустая по данным: одна nullable-колонка, БЕЗ бэкфилла.

Бэкфилла нет не по лени, а потому что он невозможен честно: «UTC+2» — это и
Прага летом, и Хельсинки зимой, и Кейптаун круглый год. Догадка здесь означала
бы, что половина студий получит правильное время до ближайшего перевода стрелок
и неправильное после. Кандидатов показывает scripts/timezones.py, применяет их
человек.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd5e8a2c04f19'
down_revision = 'c9b1f4a7d032'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('studios', sa.Column('tz_iana', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('studios', 'tz_iana')
