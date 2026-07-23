"""migrate discount type values to keys

Revision ID: fc8d7d077d19
Revises: 8ae844566f25
Create Date: 2026-07-20 11:59:59.288171

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fc8d7d077d19'
down_revision: Union[str, Sequence[str], None] = '8ae844566f25'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Фронт исторически писал в discount_type русские строки ('Процент (%)',
    'Фиксированная (₽)', 'Кэшбэк') вместо ключей, которых ждёт бэк
    ('percentage'/'fixed'/'cashback') — сравнение никогда не совпадало, скидка
    молча не применялась (V5-5, задача 5)."""
    op.execute("""
        UPDATE studio_discount_configs
        SET discount_type = 'percentage'
        WHERE discount_type = 'Процент (%)'
    """)
    op.execute("""
        UPDATE studio_discount_configs
        SET discount_type = 'fixed'
        WHERE discount_type = 'Фиксированная (₽)'
    """)
    op.execute("""
        UPDATE studio_discount_configs
        SET discount_type = 'cashback'
        WHERE discount_type = 'Кэшбэк'
    """)


def downgrade() -> None:
    raise RuntimeError(
        "Cannot safely downgrade discount_type key migration: the original "
        "Russian-string values were intentionally collapsed into keys."
    )
