"""Check bundle parts after cascading removal of a studio or its catalog.

Revision ID: b48e71d920af
Revises: a261cf96dd5a
"""
from alembic import op

revision = 'b48e71d920af'
down_revision = 'a261cf96dd5a'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('ALTER TABLE service_bundle_items ALTER CONSTRAINT '
               'service_bundle_items_service_id_fkey DEFERRABLE INITIALLY DEFERRED')


def downgrade():
    op.execute('ALTER TABLE service_bundle_items ALTER CONSTRAINT '
               'service_bundle_items_service_id_fkey NOT DEFERRABLE INITIALLY IMMEDIATE')
