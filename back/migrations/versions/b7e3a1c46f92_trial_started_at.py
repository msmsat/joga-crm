"""trial_started_at on studio_billing_plans

Revision ID: b7e3a1c46f92
Revises: a4f2c9d81b60
Create Date: 2026-08-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e3a1c46f92'
down_revision: Union[str, Sequence[str], None] = 'a4f2c9d81b60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'studio_billing_plans',
        sa.Column('trial_started_at', sa.DateTime(), nullable=True),
    )

    # Бэкофилл. До этой ревизии триал выдавал онбординг молча КАЖДОЙ создаваемой
    # студии, поэтому все существующие строки свой бесплатный период уже
    # получили — без отметки они смогли бы взять его второй раз.
    #
    # Исключение — строки со status='none': это заглушки, которые заводит
    # checkout._get_or_create_plan при заходе на оформление. Своего триала у них
    # не было, и отбирать его не за что.
    op.execute(
        "UPDATE studio_billing_plans "
        "SET trial_started_at = COALESCE(trial_started_at, NOW()) "
        "WHERE status <> 'none'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studio_billing_plans', 'trial_started_at')
