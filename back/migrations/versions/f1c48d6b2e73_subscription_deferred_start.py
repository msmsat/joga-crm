"""отложенный старт абонемента: starts_at + duration_days

Абонемент, купленный поверх незаконченного, встаёт в очередь (status="pending")
и не начинает свой срок, пока клиент не отходит по нему первое занятие. Чтобы
посчитать expires_at в момент активации, нужна длительность — пакет к тому
времени могли удалить или поменять ему duration_days, поэтому копируем её в
сам абонемент при продаже.

Существующие строки уже идут (status="active"), их starts_at остаётся null —
это поле только для показа «действует с ...», решения принимаются по status.

Revision ID: f1c48d6b2e73
Revises: d8b3f5027a91
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1c48d6b2e73"
down_revision: Union[str, Sequence[str], None] = "d8b3f5027a91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_subscriptions", sa.Column("starts_at", sa.Date(), nullable=True))
    op.add_column(
        "client_subscriptions",
        sa.Column("duration_days", sa.Integer(), server_default="90", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("client_subscriptions", "duration_days")
    op.drop_column("client_subscriptions", "starts_at")
