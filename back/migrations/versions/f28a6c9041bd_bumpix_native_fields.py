"""Native client profiles, lesson photos and migration identities.

Revision ID: f28a6c9041bd
Revises: d7318c02f4a6
"""
from alembic import op
import sqlalchemy as sa

revision = 'f28a6c9041bd'
down_revision = 'd7318c02f4a6'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('lessons', 'name', existing_type=sa.String(100), type_=sa.String(150), existing_nullable=False)
    for name, kind in [('avatar_url', sa.String(300)), ('phone2', sa.String(100)),
                       ('address', sa.Text()), ('balance', sa.String(100)), ('discount', sa.String(100))]:
        op.add_column('clients', sa.Column(name, kind, nullable=True))
    op.add_column('lessons', sa.Column('source_status', sa.String(20), nullable=True))
    op.add_column('lessons', sa.Column('source_details', sa.JSON(), nullable=True))
    op.add_column('client_notes', sa.Column('lesson_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_client_note_lesson', 'client_notes', 'lessons', ['lesson_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_client_notes_lesson_id', 'client_notes', ['lesson_id'])
    op.add_column('bumpix_journal_links', sa.Column('note_id', sa.Integer(), nullable=True))
    op.add_column('bumpix_journal_links', sa.Column('managed_values', sa.JSON(), nullable=True))
    op.create_foreign_key('fk_bumpix_journal_note', 'bumpix_journal_links', 'client_notes', ['note_id'], ['id'], ondelete='SET NULL')
    op.create_unique_constraint('uq_bumpix_journal_note', 'bumpix_journal_links', ['note_id'])
    op.create_table('bumpix_service_links',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('studio_id', sa.Integer(), sa.ForeignKey('studios.id', ondelete='CASCADE'), nullable=False),
        sa.Column('account_key', sa.String(64), nullable=False),
        sa.Column('source_key', sa.Text(), nullable=False),
        sa.Column('service_id', sa.Integer(), sa.ForeignKey('services.id', ondelete='SET NULL'), nullable=True),
        sa.UniqueConstraint('studio_id', 'account_key', 'source_key', name='uq_bumpix_service_source'))
    op.create_index('ix_bumpix_service_links_studio_id', 'bumpix_service_links', ['studio_id'])


def downgrade():
    op.alter_column('lessons', 'name', existing_type=sa.String(150), type_=sa.String(100), existing_nullable=False)
    op.drop_table('bumpix_service_links')
    op.drop_constraint('uq_bumpix_journal_note', 'bumpix_journal_links', type_='unique')
    op.drop_constraint('fk_bumpix_journal_note', 'bumpix_journal_links', type_='foreignkey')
    op.drop_column('bumpix_journal_links', 'managed_values')
    op.drop_column('bumpix_journal_links', 'note_id')
    op.drop_index('ix_client_notes_lesson_id', table_name='client_notes')
    op.drop_constraint('fk_client_note_lesson', 'client_notes', type_='foreignkey')
    op.drop_column('client_notes', 'lesson_id')
    op.drop_column('lessons', 'source_details')
    op.drop_column('lessons', 'source_status')
    for name in ('discount', 'balance', 'address', 'phone2', 'avatar_url'):
        op.drop_column('clients', name)
