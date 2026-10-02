"""Keep actual access grant time independent from payment's fiscal date.

Revision ID: c8b73b25dbaf
Revises: 2ad908ed7410
Create Date: 2026-10-02
"""
from alembic import op
import sqlalchemy as sa

revision = "c8b73b25dbaf"
down_revision = "2ad908ed7410"
branch_labels = None
depends_on = None


def upgrade():
    # Nullable on historical orders: replay keeps their existing paid_at baseline.
    op.add_column("billing_invoices", sa.Column("access_granted_at", sa.DateTime(timezone=False), nullable=True))


def downgrade():
    op.drop_column("billing_invoices", "access_granted_at")
