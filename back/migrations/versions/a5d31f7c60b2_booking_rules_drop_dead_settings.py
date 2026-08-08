"""booking rules: drop dead settings (sms_confirmation, slot_step_min)

Обе колонки не читал ни один код: SMS-канала в продукте нет вовсе (notifier
работает по email/telegram/whatsapp/instagram), а шаг слотов нечему задавать —
клиент записывается на реальное занятие Журнала, генерируемых слотов нет.

Revision ID: a5d31f7c60b2
Revises: 268c7f42c95a
Create Date: 2026-08-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5d31f7c60b2'
down_revision: Union[str, Sequence[str], None] = '268c7f42c95a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('studio_booking_settings', 'sms_confirmation')
    op.drop_column('studio_booking_settings', 'slot_step_min')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('studio_booking_settings', sa.Column('slot_step_min', sa.Integer(), nullable=False, server_default='60'))
    op.add_column('studio_booking_settings', sa.Column('sms_confirmation', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column('studio_booking_settings', 'slot_step_min', server_default=None)
    op.alter_column('studio_booking_settings', 'sms_confirmation', server_default=None)
