"""Скидка на первое занятие суммой, а не только процентом.

  * studio_booking_settings.trial_discount_type — чем задана скидка: 'percent'
    (как до сих пор, умолчание — у всех студий после наката ничего не меняется)
    или 'amount';
  * studio_booking_settings.trial_discount_amount — сумма в валюте студии.
    Процент остаётся своей колонкой: переключение вида в Лояльности не стирает
    другое значение;
  * reservations.trial_discount_amount — сумма, ОБЕЩАННАЯ при записи (снимок, как
    trial_discount_percent). У брони со скидкой суммой процента нет.

Revision ID: 68dd2348ca56
Revises: b96d3210e4a7
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa

revision = "68dd2348ca56"
down_revision = "b96d3210e4a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "studio_booking_settings",
        sa.Column("trial_discount_type", sa.String(10), server_default="percent", nullable=False),
    )
    op.add_column("studio_booking_settings", sa.Column("trial_discount_amount", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "check_booking_settings_trial_type", "studio_booking_settings",
        "trial_discount_type IN ('percent', 'amount')",
    )
    op.create_check_constraint(
        "check_booking_settings_trial_amount", "studio_booking_settings",
        "trial_discount_amount IS NULL OR trial_discount_amount >= 1",
    )
    op.create_check_constraint(
        "check_booking_settings_trial_amount_set", "studio_booking_settings",
        "trial_discount_type = 'percent' OR trial_discount_amount IS NOT NULL",
    )
    op.add_column("reservations", sa.Column("trial_discount_amount", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "check_reservation_trial_amount", "reservations",
        "trial_discount_amount IS NULL OR (trial_discount_amount >= 1 AND trial_discount_percent IS NULL)",
    )


def downgrade() -> None:
    # Брони со скидкой суммой теряют обещание: процента у них нет, а пустой
    # снимок пробной брони читается как подарок (100 %). Так хотя бы клиент
    # не заплатит больше обещанного.
    op.drop_constraint("check_reservation_trial_amount", "reservations", type_="check")
    op.drop_column("reservations", "trial_discount_amount")
    op.drop_constraint("check_booking_settings_trial_amount_set", "studio_booking_settings", type_="check")
    op.drop_constraint("check_booking_settings_trial_amount", "studio_booking_settings", type_="check")
    op.drop_constraint("check_booking_settings_trial_type", "studio_booking_settings", type_="check")
    op.drop_column("studio_booking_settings", "trial_discount_amount")
    op.drop_column("studio_booking_settings", "trial_discount_type")
