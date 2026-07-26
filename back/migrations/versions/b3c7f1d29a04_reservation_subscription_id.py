"""reservation subscription_id (списание/возврат занятия абонемента)

Revision ID: b3c7f1d29a04
Revises: 08d1e987cc4c
Create Date: 2026-07-26 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c7f1d29a04'
down_revision: Union[str, Sequence[str], None] = '08d1e987cc4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('reservations', sa.Column('subscription_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_reservations_subscription_id'), 'reservations', ['subscription_id'], unique=False)
    op.create_foreign_key(
        'fk_reservations_subscription_id', 'reservations', 'client_subscriptions',
        ['subscription_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_reservations_subscription_id', 'reservations', type_='foreignkey')
    op.drop_index(op.f('ix_reservations_subscription_id'), table_name='reservations')
    op.drop_column('reservations', 'subscription_id')
