"""stripe_checkouts: subscription_id — связь заявки с проданным абонементом

Нужна возврату: при полном возврате продажа откатывается автоматически
(routers/checkout/stripe_pay._revert_sale), и погасить надо ИМЕННО тот абонемент,
который оплатила эта заявка. Без ссылки пришлось бы угадывать «последний похожий»,
а клиент мог купить один и тот же пакет дважды — наличными и картой.

Revision ID: b1c7e4f20a15
Revises: a63b4dcdc05d
Create Date: 2026-08-09 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c7e4f20a15'
down_revision: Union[str, Sequence[str], None] = 'a63b4dcdc05d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'stripe_checkouts',
        sa.Column('subscription_id', sa.Integer(), nullable=True),
    )
    # ondelete="SET NULL": удалённый абонемент не должен блокировать заявку —
    # она остаётся историей платежа даже без предмета продажи.
    op.create_foreign_key(
        'fk_stripe_checkouts_subscription_id', 'stripe_checkouts',
        'client_subscriptions', ['subscription_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_stripe_checkouts_subscription_id', 'stripe_checkouts', type_='foreignkey')
    op.drop_column('stripe_checkouts', 'subscription_id')
