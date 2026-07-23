"""migrate_loyalty_config_values_to_keys

Эпик V5-2, задача 2: русские значения конфигов лояльности (хардкод фронта)
переводим в языконезависимые ключи, на которые уже настроены дефолты моделей
и будут ссылаться loyalty.json (задача 3). Тот же паттерн, что и миграция
категорий услуг (3a42dd4ef370). Неизвестные значения не трогаем.

Revision ID: bdbba7bc4623
Revises: bae6433ea30d
Create Date: 2026-07-18 13:28:15.075538

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bdbba7bc4623'
down_revision: Union[str, Sequence[str], None] = 'bae6433ea30d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CERT_TYPE_MAP = {
    'Именной': 'named',
    'Подарочный': 'gift',
    'На услугу': 'service',
}
_TRIGGER_CONDITION_MAP = {
    'После первого визита': 'first_visit',
    'После первой оплаты': 'first_payment',
    'Сразу при регистрации': 'registration',
}
_BONUS_TYPE_MAP = {
    'Баллами': 'points',
    'На депозит': 'deposit',
    'Скидкой': 'discount',
}
_EXPIRY_PERIOD_MAP = {
    '3 мес': '3m',
    '6 мес': '6m',
    '1 год': '1y',
    'Бессрочно': 'never',
}

_TABLE_COLUMN_MAPS = [
    ('studio_certificate_configs', 'cert_type', _CERT_TYPE_MAP),
    ('studio_referral_configs', 'trigger_condition', _TRIGGER_CONDITION_MAP),
    ('studio_referral_configs', 'bonus_type', _BONUS_TYPE_MAP),
    ('studio_loyalty_configs', 'expiry_period', _EXPIRY_PERIOD_MAP),
]


def upgrade() -> None:
    conn = op.get_bind()
    for table, column, mapping in _TABLE_COLUMN_MAPS:
        for old, new in mapping.items():
            conn.execute(
                sa.text(f"UPDATE {table} SET {column} = :new WHERE {column} = :old"),
                {"new": new, "old": old},
            )


def downgrade() -> None:
    conn = op.get_bind()
    for table, column, mapping in _TABLE_COLUMN_MAPS:
        for old, new in mapping.items():
            conn.execute(
                sa.text(f"UPDATE {table} SET {column} = :old WHERE {column} = :new"),
                {"old": old, "new": new},
            )
