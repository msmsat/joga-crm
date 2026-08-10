"""studio_billing_plans.stripe_customer_id — уникальный индекс

По этому полю вебхук биллинга ищет студию через scalar_one_or_none():
`webhook.find_plan_by_subscription` (запасной путь линковки ПЕРВОЙ карточной
оплаты — у неё нет subscription_id, пока Stripe не создаст подписку) и
`webhook._handle_setup_intent` (привязка карты без списания).

Уникальность держал только код (`ensure_customer` заводит клиента на студию), а
БД — ничего. Две строки с одним customer'ом означали бы MultipleResultsFound
внутри хендлера, то есть необработанное событие: раньше оно молча терялось, теперь
уйдёт в бесконечный ретрай Stripe. Оба исхода плохие — закрываем на уровне БД.

Индекс частичный по своей природе: NULL в Postgres друг другу не равны, поэтому
студии без заведённого Customer'а (до первой оплаты) под ограничение не попадают.

Revision ID: c2e8a1f7b3d4
Revises: b1c7e4f20a15
Create Date: 2026-08-09 19:20:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c2e8a1f7b3d4'
down_revision: Union[str, Sequence[str], None] = 'b1c7e4f20a15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Если дубли всё-таки успели появиться, создание индекса упадёт — и это верно:
    # молча оставить две студии на одном Customer'е значит оставить и потерянные
    # оплаты. Разбирать такие пары нужно руками, автоматика тут выбрать не может.
    op.create_index(
        "ix_studio_billing_plans_stripe_customer_id",
        "studio_billing_plans",
        ["stripe_customer_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_studio_billing_plans_stripe_customer_id",
        table_name="studio_billing_plans",
    )
