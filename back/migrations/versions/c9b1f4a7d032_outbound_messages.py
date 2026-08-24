"""durable outbound message queue

Revision ID: c9b1f4a7d032
Revises: a7d3e59b4c81
Create Date: 2026-08-24

Аддитивная: одна новая таблица, ничего существующего не трогает, бэкфилла нет.

Два частичных индекса, оба под реальные запросы:
  uq_outbound_thread_sending — физический запрет двух одновременных отправок в
      один разговор. Именно UNIQUE, а не проверка в коде: между «посмотрели, что
      никто не шлёт» и «пометили sending» успевает второй воркер.
  ix_outbound_open — выборка очереди. Полный индекс по status рос бы вместе с
      историей отправок и не давал бы ничего: незавершённых всегда единицы.
"""
from alembic import op
import sqlalchemy as sa

revision = 'c9b1f4a7d032'
down_revision = 'a7d3e59b4c81'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'outbound_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('studio_id', sa.Integer(), nullable=False),
        sa.Column('thread_id', sa.Integer(), nullable=False),
        sa.Column('origin', sa.String(length=10), nullable=False, server_default='agent'),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('dedup_key', sa.String(length=120), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False, server_default='queued'),
        sa.Column('attempt', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('run_after', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column('locked_by', sa.String(length=64), nullable=True),
        sa.Column('locked_at', sa.DateTime(timezone=False), nullable=True),
        sa.Column('provider_message_id', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=False), nullable=True),
        sa.Column('last_error', sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['thread_id'], ['channel_threads.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('dedup_key', name='uq_outbound_dedup'),
    )
    op.create_index(op.f('ix_outbound_messages_id'), 'outbound_messages', ['id'])
    op.create_index(op.f('ix_outbound_messages_studio_id'), 'outbound_messages', ['studio_id'])
    op.create_index(op.f('ix_outbound_messages_created_at'), 'outbound_messages', ['created_at'])
    op.create_index(
        'uq_outbound_thread_sending', 'outbound_messages', ['thread_id'],
        unique=True, postgresql_where=sa.text("status = 'sending'"),
    )
    op.create_index(
        'ix_outbound_open', 'outbound_messages', ['thread_id', 'id'],
        postgresql_where=sa.text("status IN ('queued', 'sending')"),
    )


def downgrade() -> None:
    op.drop_index('ix_outbound_open', table_name='outbound_messages')
    op.drop_index('uq_outbound_thread_sending', table_name='outbound_messages')
    op.drop_index(op.f('ix_outbound_messages_created_at'), table_name='outbound_messages')
    op.drop_index(op.f('ix_outbound_messages_studio_id'), table_name='outbound_messages')
    op.drop_index(op.f('ix_outbound_messages_id'), table_name='outbound_messages')
    op.drop_table('outbound_messages')
