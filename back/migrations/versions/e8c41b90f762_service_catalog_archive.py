"""Preserve service history when hiding a catalogue entry.

Revision ID: e8c41b90f762
Revises: c74d80ab316e
"""
from alembic import op
import sqlalchemy as sa

revision = "e8c41b90f762"
down_revision = "c74d80ab316e"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("services", sa.Column(
        "is_archived", sa.Boolean(), nullable=False, server_default=sa.false(),
    ))


def downgrade():
    op.drop_column("services", "is_archived")
