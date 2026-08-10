"""studio_billing_plans: запланированная смена тарифа

Апгрейд (Старт → Pro/Business) по умолчанию вступает в силу НЕ сразу, а с концом
текущего оплаченного периода: студия не должна сжигать остаток, за который уже
заплатила. Сам перенос ведёт Stripe (Subscription Schedule), эти два поля —
только то, что показать владельцу на странице оплаты, не запрашивая расписание у
Stripe на каждый рендер.

Ступень доступа они НЕ поднимают: это по-прежнему делает оплаченный счёт
(routers/billing/webhook._activate). Поля справочные, и рассинхрон с Stripe стоит
неверной подписи в интерфейсе, а не выданного бесплатно тарифа.

Revision ID: e5a4c8d1f962
Revises: d3f9b2a6c1e7
Create Date: 2026-08-09 21:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5a4c8d1f962'
down_revision: Union[str, Sequence[str], None] = 'd3f9b2a6c1e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("studio_billing_plans", sa.Column("scheduled_plan", sa.String(length=100), nullable=True))
    op.add_column("studio_billing_plans", sa.Column("scheduled_at", sa.DateTime(timezone=False), nullable=True))


def downgrade() -> None:
    op.drop_column("studio_billing_plans", "scheduled_at")
    op.drop_column("studio_billing_plans", "scheduled_plan")
