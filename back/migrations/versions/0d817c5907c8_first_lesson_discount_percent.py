"""Скидка на первое занятие в процентах.

Две колонки (docs/superpowers/specs/2026-09-26-first-lesson-discount-and-booking-payment-design.md):

  * studio_booking_settings.trial_discount_percent — сколько процентов снимает
    первое занятие. 100 — прежний подарок «Первое занятие бесплатно», поэтому
    у всех студий после наката поведение не меняется. Вкл/выкл остаётся на
    прежнем тумблере trial_lesson_free;
  * reservations.trial_discount_percent — процент, ОБЕЩАННЫЙ при записи. Касса
    пересчитывает цену при оплате заново, и без снимка клиент, записанный за
    −50 %, после смены процента в Лояльности заплатил бы уже по новому.

Уже существующие пробные брони — подарки, им проставляется 100.

Revision ID: 0d817c5907c8
Revises: d0eb9096829e
Create Date: 2026-09-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0d817c5907c8"
down_revision = "d0eb9096829e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "studio_booking_settings",
        sa.Column("trial_discount_percent", sa.SmallInteger(), server_default="100", nullable=False),
    )
    op.create_check_constraint(
        "check_booking_settings_trial_percent",
        "studio_booking_settings",
        "trial_discount_percent >= 1 AND trial_discount_percent <= 100",
    )
    op.add_column("reservations", sa.Column("trial_discount_percent", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "check_reservation_trial_percent",
        "reservations",
        "trial_discount_percent IS NULL OR (trial_discount_percent >= 1 AND trial_discount_percent <= 100)",
    )
    op.execute("UPDATE reservations SET trial_discount_percent = 100 WHERE is_trial")


def downgrade() -> None:
    op.drop_constraint("check_reservation_trial_percent", "reservations", type_="check")
    op.drop_column("reservations", "trial_discount_percent")
    op.drop_constraint("check_booking_settings_trial_percent", "studio_booking_settings", type_="check")
    op.drop_column("studio_booking_settings", "trial_discount_percent")
