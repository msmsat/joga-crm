"""migrate_service_categories_to_keys

Revision ID: 3a42dd4ef370
Revises: afeab66887be
Create Date: 2026-07-17 19:02:12.010238

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a42dd4ef370'
down_revision: Union[str, Sequence[str], None] = 'afeab66887be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Русские категории были хардкодом на фронте (SERVICE_CATEGORIES) — переводим в
# ключи, на которые ссылается catalog.json (services.categories.*). Неизвестные
# (нестандартные) категории не трогаем — они и раньше показывались как есть.
_CATEGORY_MAP = {
    'Йога': 'yoga',
    'Пилатес': 'pilates',
    'Стретчинг': 'stretching',
    'Индивидуальные': 'individual',
}


def upgrade() -> None:
    conn = op.get_bind()
    for old, new in _CATEGORY_MAP.items():
        conn.execute(
            sa.text("UPDATE services SET category = :new WHERE category = :old"),
            {"new": new, "old": old},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for old, new in _CATEGORY_MAP.items():
        conn.execute(
            sa.text("UPDATE services SET category = :old WHERE category = :new"),
            {"old": old, "new": new},
        )
