"""billing: notify_before_autocharge + card.method_type

Revision ID: 290f927b547d
Revises: e79cb1b532c1
Create Date: 2026-07-25 01:24:45.353196

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '290f927b547d'
down_revision: Union[str, Sequence[str], None] = 'e79cb1b532c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('payment_cards', sa.Column(
        'method_type', sa.String(length=10), nullable=False, server_default=sa.text("'card'"),
    ))
    op.add_column('studio_billing_plans', sa.Column(
        'notify_before_autocharge', sa.Boolean(), nullable=False, server_default=sa.true(),
    ))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studio_billing_plans', 'notify_before_autocharge')
    op.drop_column('payment_cards', 'method_type')
