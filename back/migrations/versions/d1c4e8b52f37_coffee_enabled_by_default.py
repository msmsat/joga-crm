"""кофе после занятия включён по умолчанию

Решение владельца продукта (11.08.2026): механика знакомств не заводится, если
её надо сначала найти и включить — владелец не ищет тумблер, о котором не знает.

Отдельной миграцией, а не правкой c5a1f9e37b20: та уже применена, и менять
применённую ревизию значит оставить расхождение везде, где она прошла.

Существующие строки переводим тоже — иначе «по умолчанию включено» касалось бы
только студий, зарегистрированных после выката. Выключившим вручную это ничего
не ломает: на момент миграции выключить его ещё никто не мог, колонка появилась
предыдущей ревизией и всем проставилась в false.

Revision ID: d1c4e8b52f37
Revises: c5a1f9e37b20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1c4e8b52f37"
down_revision: Union[str, Sequence[str], None] = "c5a1f9e37b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "studio_booking_settings", "coffee_enabled",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=sa.true(),
    )
    op.execute("UPDATE studio_booking_settings SET coffee_enabled = true")


def downgrade() -> None:
    op.alter_column(
        "studio_booking_settings", "coffee_enabled",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=sa.false(),
    )
    op.execute("UPDATE studio_booking_settings SET coffee_enabled = false")
