"""referrer_bonus_rubles_default

Эпик V5-2, задача 1: referrer_bonus хранился как копейки (дефолт 50000 = 500 ₽
по старой логике); деньги проекта теперь целые рубли — дефолт 500. Строки,
где значение осталось нетронутым (== 50000), переводим в рубли; кастомные
значения владельцев не трогаем.

Revision ID: bae6433ea30d
Revises: 45d9c1ee632e
Create Date: 2026-07-18 13:23:19.126032

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bae6433ea30d'
down_revision: Union[str, Sequence[str], None] = '45d9c1ee632e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'studio_referral_configs', 'referrer_bonus',
        server_default='500',
    )
    op.execute(
        "UPDATE studio_referral_configs SET referrer_bonus = 500 WHERE referrer_bonus = 50000"
    )


def downgrade() -> None:
    op.alter_column(
        'studio_referral_configs', 'referrer_bonus',
        server_default='50000',
    )
    op.execute(
        "UPDATE studio_referral_configs SET referrer_bonus = 50000 WHERE referrer_bonus = 500"
    )
