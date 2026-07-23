"""add op_type to financial goals

Revision ID: cd2197c888c3
Revises: 6fea40bdc7ef
Create Date: 2026-07-20 12:43:26.123665

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cd2197c888c3'
down_revision: Union[str, Sequence[str], None] = '6fea40bdc7ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'financial_goals',
        sa.Column('op_type', sa.String(length=3), nullable=False, server_default='in'),
    )
    op.alter_column('financial_goals', 'op_type', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('financial_goals', 'op_type')
