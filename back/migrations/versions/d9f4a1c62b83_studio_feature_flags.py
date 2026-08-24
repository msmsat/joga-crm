"""studio feature flags

Инфраструктура пофазового включения Receptionist на отдельных студиях.

Миграция аддитивная и самодостаточная: строк не заводит ни для одной студии,
существующие таблицы не трогает. Отсутствие строки означает «выключено»
(services/feature_flags), поэтому бэкфилл не нужен — при раскатке на три пилота
появятся ровно три строки. Таблица может существовать сколько угодно долго до
первого использования: пока код не спрашивает флаги, она просто пуста.

Revision ID: d9f4a1c62b83
Revises: 1e01c7cabef5
Create Date: 2026-08-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9f4a1c62b83'
down_revision: Union[str, Sequence[str], None] = '1e01c7cabef5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'studio_feature_flags',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('studio_id', sa.Integer(), nullable=False),
        sa.Column('flag', sa.String(length=50), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        # Арбитр однократности: два процесса, одновременно включающих один этап
        # одной студии, дают одну строку, а не две (services/feature_flags.set_flag
        # опирается на этот индекс в ON CONFLICT).
        sa.UniqueConstraint('studio_id', 'flag', name='uq_studio_feature_flag'),
    )
    op.create_index(op.f('ix_studio_feature_flags_id'), 'studio_feature_flags', ['id'])
    op.create_index(op.f('ix_studio_feature_flags_studio_id'), 'studio_feature_flags', ['studio_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_studio_feature_flags_studio_id'), table_name='studio_feature_flags')
    op.drop_index(op.f('ix_studio_feature_flags_id'), table_name='studio_feature_flags')
    op.drop_table('studio_feature_flags')
