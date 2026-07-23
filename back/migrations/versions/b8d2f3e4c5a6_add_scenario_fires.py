"""add scenario fires

Revision ID: b8d2f3e4c5a6
Revises: a7c1e2f3b4d5
Create Date: 2026-07-18 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d2f3e4c5a6'
down_revision: Union[str, Sequence[str], None] = 'a7c1e2f3b4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('scenario_fires',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scenario_id', sa.Integer(), nullable=False),
    sa.Column('client_id', sa.Integer(), nullable=False),
    sa.Column('dedup_key', sa.String(length=40), nullable=False),
    sa.Column('fired_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['scenario_id'], ['loyalty_scenarios.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('scenario_id', 'client_id', 'dedup_key', name='uq_scenario_fire')
    )
    op.create_index(op.f('ix_scenario_fires_id'), 'scenario_fires', ['id'], unique=False)
    op.create_index(op.f('ix_scenario_fires_scenario_id'), 'scenario_fires', ['scenario_id'], unique=False)
    op.create_index(op.f('ix_scenario_fires_client_id'), 'scenario_fires', ['client_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_scenario_fires_client_id'), table_name='scenario_fires')
    op.drop_index(op.f('ix_scenario_fires_scenario_id'), table_name='scenario_fires')
    op.drop_index(op.f('ix_scenario_fires_id'), table_name='scenario_fires')
    op.drop_table('scenario_fires')
