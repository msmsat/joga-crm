"""studio_billing_plans.past_due_since — якорь льготного срока неоплаты

Льготный срок при `past_due` считался от `current_period_start` подписки Stripe.
Но начало периода переставляет сам владелец: смена тарифа идёт с
`billing_cycle_anchor="now"` (routers/billing/checkout.py::_switch_now), и каждая
отклонённая карта начинала новое льготное окно — неоплаченная студия работала
сколько угодно долго. Якорь переезжает в нашу БД и снимается только успешной
оплатой (webhook._mirror_subscription_state, ветка `active`).

Revision ID: c3e8a1f7b204
Revises: b7d31f4a05c9
"""
from alembic import op
import sqlalchemy as sa

revision = "c3e8a1f7b204"
down_revision = "b7d31f4a05c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL = неоплаты не было. Существующим строкам он и нужен: у активных студий
    # якоря нет по определению, а у неоплаченных он проставится первым же
    # вебхуком `customer.subscription.updated` (Stripe шлёт их на каждую попытку
    # списания), то есть не позже следующей попытки — задним числом придумывать
    # дату начала неоплаты мы не вправе.
    op.add_column(
        "studio_billing_plans",
        sa.Column("past_due_since", sa.DateTime(timezone=False), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("studio_billing_plans", "past_due_since")
