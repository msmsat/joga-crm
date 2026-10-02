"""Local paid-only fiscal documents and explicit legal buyer identity.

Revision ID: 2ad908ed7410
Revises: f6246f517716
Create Date: 2026-10-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "2ad908ed7410"
down_revision = "f6246f517716"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("billing_legal_name", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("billing_registration_id", sa.String(40), nullable=True))
    op.add_column("billing_invoices", sa.Column("billing_details_snapshot", postgresql.JSONB(), nullable=True))
    op.create_table(
        "billing_tax_documents",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("studio_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("correction_snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("issued_at", sa.DateTime(timezone=False), nullable=True),
        sa.ForeignKeyConstraint(["invoice_id"], ["billing_invoices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["studio_id"], ["studios.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("invoice_id", name="uq_billing_tax_document_invoice"),
        sa.CheckConstraint("status IN ('pending', 'issued')", name="ck_billing_tax_document_status"),
    )
    op.create_index("ix_billing_tax_documents_studio_id", "billing_tax_documents", ["studio_id"])


def downgrade():
    op.drop_index("ix_billing_tax_documents_studio_id", table_name="billing_tax_documents")
    op.drop_table("billing_tax_documents")
    op.drop_column("billing_invoices", "billing_details_snapshot")
    op.drop_column("users", "billing_registration_id")
    op.drop_column("users", "billing_legal_name")
