"""add_duration_days_and_service_ids_to_subscription_packages

Revision ID: 45d9c1ee632e
Revises: 3a42dd4ef370
Create Date: 2026-07-17 19:45:39.121567

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '45d9c1ee632e'
down_revision: Union[str, Sequence[str], None] = '3a42dd4ef370'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subscription_packages', sa.Column('duration_days', sa.Integer(), nullable=False, server_default='90'))
    op.add_column('subscription_packages', sa.Column('service_ids', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('subscription_packages', 'service_ids')
    op.drop_column('subscription_packages', 'duration_days')
