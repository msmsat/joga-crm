"""кофе после занятия

Социальная механика мини-приложения: клиент, записавшийся на занятие, может
согласиться остаться после него на кофе с группой.

Три колонки, ни одной новой таблицы:
  - `reservations.coffee` — само согласие. Отдельная таблица участников не нужна:
    согласие имеет смысл только вместе с бронью, а отмена записи убирает человека
    из списка сама (фильтр по `status`).
  - `studio_booking_settings.coffee_enabled` — тумблер владельца, по умолчанию
    ВЫКЛЮЧЕНО: студия, которая механику не настраивала, ничего не показывает и
    ничего не рассылает.
  - `studio_booking_settings.coffee_spots` — до 3 мест рядом со студией,
    [{"name": ..., "address": ..., "url": ...}]; NULL = мест не задано.

Revision ID: c5a1f9e37b20
Revises: b8d3f6a1c704
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5a1f9e37b20"
down_revision: Union[str, Sequence[str], None] = "b8d3f6a1c704"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default обязателен: в таблице уже есть строки, а колонка NOT NULL.
    op.add_column(
        "reservations",
        sa.Column("coffee", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "studio_booking_settings",
        sa.Column("coffee_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "studio_booking_settings",
        sa.Column("coffee_spots", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("studio_booking_settings", "coffee_spots")
    op.drop_column("studio_booking_settings", "coffee_enabled")
    op.drop_column("reservations", "coffee")
