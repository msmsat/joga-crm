"""reservation payment breakdown

Снимок «чем оплачено занятие» на брони: скидки, промокод, баллы, депозит,
сертификат, итог и способ оплаты — то, что было на кассе в момент оплаты.
Журнал и история клиента показывают его как есть, не пересчитывая. Старые
брони остаются с NULL: восстановить, какая скидка тогда сработала, не из чего.

Revision ID: 03d17540190b
Revises: a74771fbf697
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa

revision = "03d17540190b"
down_revision = "a74771fbf697"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reservations", sa.Column("payment_breakdown", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("reservations", "payment_breakdown")
