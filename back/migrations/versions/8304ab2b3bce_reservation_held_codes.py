"""reservation held codes

Промокод, ваучер, баллы и депозит, которые клиент назвал при записи из
мини-приложения. Деньги ещё не взяты (оплата на месте или форма Stripe
открыта), поэтому коды не гасятся, а ДЕРЖАТСЯ на брони: долг заводится уже со
скидкой, а второй раз их не применить, пока бронь жива. Гасит их оплата брони
(касса Журнала или вебхук Stripe). Старые брони — NULL: кодов у них не было.

Revision ID: 8304ab2b3bce
Revises: ab62c934de17
Create Date: 2026-10-01
"""
from alembic import op
import sqlalchemy as sa

revision = "8304ab2b3bce"
down_revision = "ab62c934de17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reservations", sa.Column("held_codes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("reservations", "held_codes")
