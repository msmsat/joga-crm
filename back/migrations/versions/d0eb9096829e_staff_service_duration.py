"""Индивидуальная длительность услуги у мастера.

Соседка колонки `price` в той же связи `user_services` и по тем же причинам:
длительность живёт там же, где сам факт «этот мастер делает эту услугу», и
снимается вместе с ним.

NULL — «как у услуги». Все существующие пары получают NULL, поэтому после
наката ни одна запись и ни один слот не меняются. Ноль, в отличие от цены,
законным значением НЕ является: услуга длительностью ноль минут не занимает
времени мастера, и слот под неё помещался бы поверх любой записи. Потолок —
сутки, как у самой услуги (`ServiceCreate`).

Revision ID: d0eb9096829e
Revises: b48e71d920af
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa

revision = "d0eb9096829e"
down_revision = "b48e71d920af"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_services", sa.Column("duration_min", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "check_user_services_duration_range",
        "user_services",
        "duration_min IS NULL OR (duration_min >= 1 AND duration_min <= 1440)",
    )


def downgrade() -> None:
    op.drop_constraint("check_user_services_duration_range", "user_services", type_="check")
    op.drop_column("user_services", "duration_min")
