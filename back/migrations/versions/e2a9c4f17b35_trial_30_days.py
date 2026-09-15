"""trial period 14 -> 30 days for trials already in progress

Revision ID: e2a9c4f17b35
Revises: c7e5a92f31bd
Create Date: 2026-09-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e2a9c4f17b35'
down_revision: Union[str, Sequence[str], None] = 'c7e5a92f31bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Числа заморожены здесь, а не импортируются из routers.billing.plans: миграция
# обязана делать то же самое и через год, когда TRIAL_DAYS поменяют снова.
NEW_DAYS = 30
OLD_DAYS = 14

# Только студии, которые сидят на триале и ещё НИЧЕГО не оформили в Stripe.
# У оформившей подписку (`stripe_subscription_id`) дата начала списаний уже
# записана в Stripe как trial_end — сдвинуть наше зеркало значило бы открыть
# доступ, за который никто не выставит счёт в срок.
_TRIAL_ROWS = (
    "plan_name = 'free_trial' AND status = 'trial' "
    "AND trial_started_at IS NOT NULL AND stripe_subscription_id IS NULL"
)


def upgrade() -> None:
    """Upgrade schema."""
    # Пробный период стал 30 дней. Кто начал 14-дневный — получает те же 30 от
    # своего старта: и идущий триал, и уже упёршийся в пейволл, если с начала
    # не прошло 30 дней. Дату только продлеваем, никогда не укорачиваем.
    op.execute(
        "UPDATE studio_billing_plans "
        f"SET expires_at = trial_started_at + INTERVAL '{NEW_DAYS} days' "
        f"WHERE {_TRIAL_ROWS} "
        f"AND (expires_at IS NULL OR expires_at < trial_started_at + INTERVAL '{NEW_DAYS} days')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Возвращаем 14 дней только тем строкам, у которых срок ровно 30 от старта,
    # то есть поставлен этой миграцией или новым кодом активации.
    op.execute(
        "UPDATE studio_billing_plans "
        f"SET expires_at = trial_started_at + INTERVAL '{OLD_DAYS} days' "
        f"WHERE {_TRIAL_ROWS} "
        f"AND expires_at = trial_started_at + INTERVAL '{NEW_DAYS} days'"
    )
