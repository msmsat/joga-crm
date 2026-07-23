"""add loyalty scenarios

Revision ID: a7c1e2f3b4d5
Revises: 3b12646d24b2
Create Date: 2026-07-18 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c1e2f3b4d5'
down_revision: Union[str, Sequence[str], None] = '3b12646d24b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('loyalty_scenarios',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('studio_id', sa.Integer(), nullable=False),
    sa.Column('trigger_type', sa.String(length=20), nullable=False),
    sa.Column('trigger_params', sa.JSON(), nullable=False),
    sa.Column('action_type', sa.String(length=20), nullable=False),
    sa.Column('action_params', sa.JSON(), nullable=False),
    sa.Column('channel', sa.String(length=20), nullable=False),
    sa.Column('is_enabled', sa.Boolean(), nullable=False),
    sa.Column('fired_count', sa.Integer(), nullable=False),
    sa.Column('last_run_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint(
        "trigger_type IN ('inactive_days', 'low_subscription', 'birthday', 'nth_visit', 'referral')",
        name='check_scenario_trigger_type'),
    sa.CheckConstraint(
        "action_type IN ('points', 'gift_classes', 'certificate', 'renewal_offer')",
        name='check_scenario_action_type'),
    sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_loyalty_scenarios_id'), 'loyalty_scenarios', ['id'], unique=False)
    op.create_index(op.f('ix_loyalty_scenarios_studio_id'), 'loyalty_scenarios', ['studio_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_loyalty_scenarios_studio_id'), table_name='loyalty_scenarios')
    op.drop_index(op.f('ix_loyalty_scenarios_id'), table_name='loyalty_scenarios')
    op.drop_table('loyalty_scenarios')
