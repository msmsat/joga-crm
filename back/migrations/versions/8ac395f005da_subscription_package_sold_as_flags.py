"""subscription package sold_as flags

Revision ID: 8ac395f005da
Revises: 9c473c688f70
Create Date: 2026-07-20 23:16:39.948631

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ac395f005da'
down_revision: Union[str, Sequence[str], None] = '9c473c688f70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default=true — обратная совместимость: существующие пакеты продолжают
    # продаваться в обоих табах кассы, как и раньше.
    op.add_column('subscription_packages', sa.Column('sold_as_single', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('subscription_packages', sa.Column('sold_as_subscription', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column('subscription_packages', 'sold_as_single', server_default=None)
    op.alter_column('subscription_packages', 'sold_as_subscription', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('subscription_packages', 'sold_as_subscription')
    op.drop_column('subscription_packages', 'sold_as_single')
