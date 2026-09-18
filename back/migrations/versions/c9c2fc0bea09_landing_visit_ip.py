"""Адрес посетителя лендинга.

Колонка нужна, чтобы владелец продукта смотрел заходы поимённо, а не верил
итоговым числам. Данные персональные: старые строки остаются без адреса
(NULL = «не собирали»), задним числом он не появляется ниоткуда.

Revision ID: c9c2fc0bea09
Revises: aa457ff31dab
Create Date: 2026-09-17
"""
from alembic import op
import sqlalchemy as sa

revision = "c9c2fc0bea09"
down_revision = "aa457ff31dab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("landing_visits", sa.Column("ip", sa.String(length=45), nullable=True))


def downgrade() -> None:
    op.drop_column("landing_visits", "ip")
