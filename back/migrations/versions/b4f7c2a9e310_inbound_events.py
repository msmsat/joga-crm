"""inbound events admission + durable agent jobs

Revision ID: b4f7c2a9e310
Revises: d9f4a1c62b83
Create Date: 2026-08-24

Аддитивная: две новые таблицы, ничего существующего не трогает, бэкфилла нет.
Старый бинарник продолжает работать — до них никто не обращается.

Две таблицы, а не одна, потому что у них разная природа: inbound_events —
неизменяемая история «что пришло», agent_jobs — изменяемое владение обработкой.
Смешав их, мы получили бы журнал приёма, который переписывается при каждом
перехвате зависшей попытки.

Индексы заведены только под реальные запросы:
  studio_id      — под внешний ключ, иначе удаление студии уходит в seq scan;
  received_at    — под ежечасную чистку по сроку хранения (agent_jobs.purge);
  частичный по незакрытым работам — под каждый тик восстановления.
"""
from alembic import op
import sqlalchemy as sa

revision = 'b4f7c2a9e310'
down_revision = 'd9f4a1c62b83'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'inbound_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=20), nullable=False),
        sa.Column('provider_event_id', sa.String(length=200), nullable=False),
        sa.Column('studio_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=30), nullable=False),
        sa.Column('sender_ref', sa.String(length=128), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('payload_sha256', sa.String(length=64), nullable=False),
        sa.Column('received_at', sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider', 'provider_event_id', name='uq_inbound_provider_event'),
    )
    op.create_index(op.f('ix_inbound_events_id'), 'inbound_events', ['id'])
    op.create_index(op.f('ix_inbound_events_studio_id'), 'inbound_events', ['studio_id'])
    op.create_index(op.f('ix_inbound_events_received_at'), 'inbound_events', ['received_at'])

    op.create_table(
        'agent_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('inbound_event_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False, server_default='pending'),
        sa.Column('attempt', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('claimed_at', sa.DateTime(timezone=False), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=False), nullable=True),
        sa.Column('last_error', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['inbound_event_id'], ['inbound_events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        # Ровно одна работа на событие — это и есть «не два обработчика».
        sa.UniqueConstraint('inbound_event_id', name='uq_agent_job_event'),
    )
    op.create_index(op.f('ix_agent_jobs_id'), 'agent_jobs', ['id'])
    # Восстановление ищет только незакрытые работы, и их всегда единицы. Полный
    # индекс по status рос бы вместе с историей и не давал бы ничего.
    op.create_index(
        'ix_agent_jobs_open', 'agent_jobs', ['claimed_at'],
        postgresql_where=sa.text("status IN ('pending', 'running')"),
    )


def downgrade() -> None:
    op.drop_index('ix_agent_jobs_open', table_name='agent_jobs')
    op.drop_index(op.f('ix_agent_jobs_id'), table_name='agent_jobs')
    op.drop_table('agent_jobs')
    op.drop_index(op.f('ix_inbound_events_received_at'), table_name='inbound_events')
    op.drop_index(op.f('ix_inbound_events_studio_id'), table_name='inbound_events')
    op.drop_index(op.f('ix_inbound_events_id'), table_name='inbound_events')
    op.drop_table('inbound_events')
