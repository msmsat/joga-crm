"""billing_invoices.period + уникальность (studio_id, kind, period)

Нужно минимальному месячному платежу процентного тарифа (kind="min_fee") и
комиссии с офлайн-продаж (kind="offline_fee"): оба выставляются РАЗ В МЕСЯЦ, а
воркер самовосстанавливается — пропущенный запуск догоняется следующим тиком.
Без ключа по расчётному месяцу догоняющий проход выставил бы студии второй счёт
за тот же период.

Состояния «биллили ли мы этот месяц» нигде не хранится специально: сам факт
существования строки с этим period и есть состояние, а уникальность делает
двойное выставление невозможным на уровне БД, а не на уровне аккуратности кода.

У счетов за тариф (kind="subscription") period пуст. NULL в Postgres друг другу
не равны, поэтому под ограничение они не попадают и мигрировать их не нужно.

Revision ID: d3f9b2a6c1e7
Revises: c2e8a1f7b3d4
Create Date: 2026-08-09 20:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3f9b2a6c1e7'
down_revision: Union[str, Sequence[str], None] = 'c2e8a1f7b3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "billing_invoices",
        sa.Column("period", sa.String(length=7), nullable=True),
    )
    op.create_unique_constraint(
        "uq_billing_invoice_period",
        "billing_invoices",
        ["studio_id", "kind", "period"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_billing_invoice_period", "billing_invoices", type_="unique")
    op.drop_column("billing_invoices", "period")
