"""add package_id and created_at to client_subscriptions

Revision ID: c9e3a4b5d6f7
Revises: b8d2f3e4c5a6
Create Date: 2026-07-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9e3a4b5d6f7'
down_revision: Union[str, Sequence[str], None] = 'b8d2f3e4c5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('client_subscriptions', sa.Column('package_id', sa.Integer(), nullable=True))
    op.add_column('client_subscriptions', sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True))
    op.create_foreign_key(
        'fk_client_subscriptions_package_id', 'client_subscriptions',
        'subscription_packages', ['package_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_client_subscriptions_package_id', 'client_subscriptions', type_='foreignkey')
    op.drop_column('client_subscriptions', 'created_at')
    op.drop_column('client_subscriptions', 'package_id')
