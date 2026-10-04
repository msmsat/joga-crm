"""Preserve Bumpix clients, source snapshots, visits and private media.

Revision ID: b96d3210e4a7
Revises: c8b73b25dbaf
"""
from alembic import op
import sqlalchemy as sa

revision = 'b96d3210e4a7'
down_revision = 'c8b73b25dbaf'
branch_labels = None
depends_on = None


def fk(name, target, nullable=False, ondelete='CASCADE'):
    return sa.Column(name, sa.Integer(), sa.ForeignKey(target, ondelete=ondelete), nullable=nullable)


def upgrade():
    op.create_table('bumpix_clients',
        sa.Column('id', sa.Integer(), primary_key=True), fk('studio_id', 'studios.id'),
        sa.Column('account_key', sa.String(64), nullable=False),
        sa.Column('source_client_id', sa.String(33), nullable=False), fk('client_id', 'clients.id'),
        sa.Column('snapshot_id', sa.String(64), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False), sa.Column('managed_values', sa.JSON(), nullable=False),
        fk('note_id', 'client_notes.id', True, 'SET NULL'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('studio_id', 'account_key', 'source_client_id', name='uq_bumpix_client_source'),
        sa.UniqueConstraint('studio_id', 'account_key', 'client_id', name='uq_bumpix_client_target'))
    op.create_table('bumpix_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True), fk('binding_id', 'bumpix_clients.id'),
        sa.Column('snapshot_id', sa.String(64), nullable=False), sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('binding_id', 'snapshot_id', name='uq_bumpix_snapshot'))
    op.create_table('bumpix_events',
        sa.Column('id', sa.Integer(), primary_key=True), fk('studio_id', 'studios.id'),
        sa.Column('account_key', sa.String(64), nullable=False), fk('binding_id', 'bumpix_clients.id'),
        fk('client_id', 'clients.id'), sa.Column('source_event_id', sa.String(33), nullable=False),
        sa.Column('master_source_id', sa.String(33), nullable=False), fk('teacher_user_id', 'users.id', True, 'SET NULL'),
        sa.Column('start_time', sa.DateTime(), nullable=False), sa.Column('end_time', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False), sa.Column('groups', sa.JSON(), nullable=False),
        sa.Column('group_mask', sa.Integer(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False), sa.Column('income', sa.Text(), nullable=False),
        sa.Column('outlay', sa.Text(), nullable=False), sa.Column('is_current', sa.Boolean(), nullable=False),
        sa.UniqueConstraint('studio_id', 'account_key', 'source_event_id', name='uq_bumpix_event_source'),
        sa.CheckConstraint("status IN ('new','completed','canceled')", name='ck_bumpix_event_status'))
    op.create_table('bumpix_media',
        sa.Column('id', sa.Integer(), primary_key=True), fk('studio_id', 'studios.id'),
        fk('binding_id', 'bumpix_clients.id'), fk('event_id', 'bumpix_events.id', True),
        sa.Column('kind', sa.String(10), nullable=False), sa.Column('source_owner_id', sa.String(33), nullable=False),
        sa.Column('image_id', sa.String(50), nullable=False), sa.Column('revision', sa.String(40), nullable=False),
        sa.Column('path', sa.String(300), nullable=False), sa.Column('sha256', sa.String(64), nullable=False),
        sa.Column('bytes', sa.Integer(), nullable=False), sa.Column('is_current', sa.Boolean(), nullable=False),
        sa.UniqueConstraint('binding_id', 'kind', 'source_owner_id', 'image_id', 'revision', name='uq_bumpix_media_identity'),
        sa.CheckConstraint("(kind='avatar' AND event_id IS NULL) OR (kind='event' AND event_id IS NOT NULL)", name='ck_bumpix_media_owner'))
    for table, columns in {
        'bumpix_clients': ['studio_id', 'client_id'], 'bumpix_snapshots': ['binding_id'],
        'bumpix_events': ['studio_id', 'binding_id', 'client_id', 'teacher_user_id'],
        'bumpix_media': ['studio_id', 'binding_id', 'event_id'],
    }.items():
        for column in columns:
            op.create_index('ix_' + table + '_' + column, table, [column])


def downgrade():
    for table in ('bumpix_media', 'bumpix_events', 'bumpix_snapshots', 'bumpix_clients'):
        op.drop_table(table)
