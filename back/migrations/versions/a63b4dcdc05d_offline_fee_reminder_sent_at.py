"""offline fee: reminder_sent_at on billing_invoices

Revision ID: a63b4dcdc05d
Revises: aacd10dbeacb
Create Date: 2026-08-09 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a63b4dcdc05d'
down_revision: Union[str, Sequence[str], None] = 'aacd10dbeacb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('billing_invoices', sa.Column('reminder_sent_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('billing_invoices', 'reminder_sent_at')
