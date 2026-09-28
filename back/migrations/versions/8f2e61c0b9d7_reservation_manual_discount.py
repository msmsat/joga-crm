"""reservation manual discount

Скидка администратора в процентах, данная брони при записи без оплаты: итог
мастера записи в Журнале спрашивает «свою скидку на это занятие», а деньги
клиент отдаёт позже. Долг заводится уже со скидкой, оплата берёт её сама.
Старые брони остаются с NULL — скидки им никто не давал.

Revision ID: 8f2e61c0b9d7
Revises: 03d17540190b
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa

revision = "8f2e61c0b9d7"
down_revision = "03d17540190b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reservations", sa.Column("manual_discount_percent", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "check_reservation_manual_percent", "reservations",
        "manual_discount_percent IS NULL OR (manual_discount_percent >= 1 AND manual_discount_percent <= 100)",
    )


def downgrade() -> None:
    op.drop_constraint("check_reservation_manual_percent", "reservations", type_="check")
    op.drop_column("reservations", "manual_discount_percent")
