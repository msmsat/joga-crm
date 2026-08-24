"""channel threads lease + agent_jobs.run_after

Revision ID: a7d3e59b4c81
Revises: b4f7c2a9e310
Create Date: 2026-08-24

Аддитивная: новая таблица и одна новая колонка с server_default. Старый бинарник
продолжает работать — колонку он не читает, а таблицу не знает.

run_after заполняется now() у существующих строк: работа, заведённая до
миграции, должна быть доступна немедленно, а не пропасть из выборки.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7d3e59b4c81'
down_revision = 'b4f7c2a9e310'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'agent_jobs',
        sa.Column('run_after', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f('ix_agent_jobs_run_after'), 'agent_jobs', ['run_after'])

    op.create_table(
        'channel_threads',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('studio_id', sa.Integer(), nullable=False),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.Column('sender_ref', sa.String(length=128), nullable=False),
        sa.Column('lease_owner', sa.String(length=64), nullable=True),
        sa.Column('lease_until', sa.DateTime(timezone=False), nullable=True),
        sa.Column('lease_seq', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        # Канонический ключ разговора. Ровно один тред на пару «канал ↔ человек»
        # внутри студии — это и есть то, что делает сериализацию возможной.
        sa.UniqueConstraint('studio_id', 'channel', 'sender_ref', name='uq_channel_thread'),
    )
    op.create_index(op.f('ix_channel_threads_id'), 'channel_threads', ['id'])
    op.create_index(op.f('ix_channel_threads_studio_id'), 'channel_threads', ['studio_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_channel_threads_studio_id'), table_name='channel_threads')
    op.drop_index(op.f('ix_channel_threads_id'), table_name='channel_threads')
    op.drop_table('channel_threads')
    op.drop_index(op.f('ix_agent_jobs_run_after'), table_name='agent_jobs')
    op.drop_column('agent_jobs', 'run_after')
