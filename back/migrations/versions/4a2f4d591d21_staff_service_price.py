"""Индивидуальная цена услуги у мастера.

Колонка в существующей связи `user_services`, а не отдельная таблица: цена
живёт ровно там же, где сам факт «этот мастер делает эту услугу», и снимается
вместе с ним — без сирот и без второго источника правды о той же паре.

NULL — «как у услуги». Все существующие пары получают NULL, поэтому поведение
продукта после наката не меняется: цену начинает отличать только тот, кому её
выставили руками. Ноль при этом законное значение («бесплатно у стажёра»),
поэтому «снять свою цену» — это NULL, а не 0.

Revision ID: 4a2f4d591d21
Revises: c4d2e9a71f06
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

revision = "4a2f4d591d21"
down_revision = "c4d2e9a71f06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_services", sa.Column("price", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "check_user_services_price_non_negative",
        "user_services",
        "price IS NULL OR price >= 0",
    )


def downgrade() -> None:
    op.drop_constraint("check_user_services_price_non_negative", "user_services", type_="check")
    op.drop_column("user_services", "price")
