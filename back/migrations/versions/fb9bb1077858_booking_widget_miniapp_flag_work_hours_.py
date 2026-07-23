"""booking widget: miniapp flag, work hours, slot step

Revision ID: fb9bb1077858
Revises: bfb0b344a561
Create Date: 2026-07-19 23:34:38.675401

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fb9bb1077858'
down_revision: Union[str, Sequence[str], None] = 'bfb0b344a561'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('studio_booking_settings', sa.Column('miniapp_generated', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('studio_booking_settings', sa.Column('widget_work_start', sa.String(length=5), nullable=False, server_default='09:00'))
    op.add_column('studio_booking_settings', sa.Column('widget_work_end', sa.String(length=5), nullable=False, server_default='21:00'))
    op.add_column('studio_booking_settings', sa.Column('slot_step_min', sa.Integer(), nullable=False, server_default='60'))
    op.alter_column('studio_booking_settings', 'miniapp_generated', server_default=None)
    op.alter_column('studio_booking_settings', 'widget_work_start', server_default=None)
    op.alter_column('studio_booking_settings', 'widget_work_end', server_default=None)
    op.alter_column('studio_booking_settings', 'slot_step_min', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studio_booking_settings', 'slot_step_min')
    op.drop_column('studio_booking_settings', 'widget_work_end')
    op.drop_column('studio_booking_settings', 'widget_work_start')
    op.drop_column('studio_booking_settings', 'miniapp_generated')
