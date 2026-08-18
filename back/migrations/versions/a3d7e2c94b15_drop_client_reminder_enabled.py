"""drop client_reminder_enabled

Тумблер «Напоминание клиенту» дублировал блок «Уведомления» той же страницы:
там уже есть отдельные «Напоминание за 24 ч» и «Напоминание за 2 ч», а общий
выключатель только добавлял второе место, где напоминания могут молча пропасть.

Revision ID: a3d7e2c94b15
Revises: f2c9d3e51a76
Create Date: 2026-08-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3d7e2c94b15'
down_revision: Union[str, Sequence[str], None] = 'f2c9d3e51a76'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('studio_booking_settings', 'client_reminder_enabled')


def downgrade() -> None:
    op.add_column(
        'studio_booking_settings',
        sa.Column('client_reminder_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
