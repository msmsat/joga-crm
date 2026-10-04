"""Bumpix future booking links and journal range index.

Revision ID: d7318c02f4a6
Revises: 68dd2348ca56
"""
from alembic import op
import sqlalchemy as sa
revision = 'd7318c02f4a6'
down_revision = '68dd2348ca56'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('bumpix_journal_links',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('bumpix_events.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('lesson_id', sa.Integer(), sa.ForeignKey('lessons.id', ondelete='SET NULL'), nullable=True, unique=True),
        sa.Column('reservation_id', sa.Integer(), sa.ForeignKey('reservations.id', ondelete='SET NULL'), nullable=True, unique=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False))
    op.create_index('ix_bumpix_journal_range', 'bumpix_events', ['studio_id', 'is_current', 'start_time'])


def downgrade():
    op.drop_index('ix_bumpix_journal_range', table_name='bumpix_events')
    op.drop_table('bumpix_journal_links')
