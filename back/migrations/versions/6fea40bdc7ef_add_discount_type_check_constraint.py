"""add discount type check constraint

Revision ID: 6fea40bdc7ef
Revises: fc8d7d077d19
Create Date: 2026-07-20 12:00:54.868648

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6fea40bdc7ef'
down_revision: Union[str, Sequence[str], None] = 'fc8d7d077d19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_check_constraint(
        'check_studio_discount_type',
        'studio_discount_configs',
        "discount_type IN ('percentage', 'fixed', 'cashback')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('check_studio_discount_type', 'studio_discount_configs', type_='check')
