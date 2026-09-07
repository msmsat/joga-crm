"""merge booking hold and studio subtype heads

Схема разошлась на две ветки от `c3e8a1f7b204`, потому что над ней работали
параллельно: одна ветка добавила статус `hold` в CHECK брони (оплата занятия
картой, P4), вторая расширила `studios.business_subtype` под набор направлений.
Пересечения между ними нет — разные таблицы, разные колонки.

Ревизия ПУСТАЯ намеренно: сливать нечего, нужно ровно одно — одна голова, к
которой применится `alembic upgrade head` на боевом сервере. Две головы там
означают, что половина схемы молча не доедет.

Revision ID: f30d8b6177e9
Revises: 50105defb880, b3f7c20d91ae
Create Date: 2026-09-06 23:39:27.038882

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f30d8b6177e9'
down_revision: Union[str, Sequence[str], None] = ('50105defb880', 'b3f7c20d91ae')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Слияние веток: своих изменений схемы нет."""


def downgrade() -> None:
    """Обратно в две головы: своих изменений схемы нет."""
