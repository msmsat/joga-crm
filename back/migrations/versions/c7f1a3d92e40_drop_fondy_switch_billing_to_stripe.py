"""drop fondy: gateway keys out, stripe customer in

Отказ от Fondy целиком:
  * `payment_cards.stripe_customer_id` — вторая половина сохранённой карты
    (вместе с rectoken=pm_… хватает на off-session списание в «Продлить»);
  * `online_channels.public_key/secret_key` — колонки жили только под ключи
    мерчанта Fondy. Единственный оставшийся шлюз (Stripe Connect) чужих ключей
    не требует по построению, поэтому хранить их больше негде и незачем.

Revision ID: c7f1a3d92e40
Revises: ba9511ee5bbb
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7f1a3d92e40"
down_revision: Union[str, Sequence[str], None] = "ba9511ee5bbb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payment_cards", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    op.drop_column("online_channels", "secret_key")
    op.drop_column("online_channels", "public_key")


def downgrade() -> None:
    # Колонки возвращаются пустыми: ключи Fondy не сохраняются — откат схемы
    # восстанавливает форму таблицы, а не выброшенные секреты.
    op.add_column("online_channels", sa.Column("public_key", sa.String(length=300), nullable=True))
    op.add_column("online_channels", sa.Column("secret_key", sa.String(length=300), nullable=True))
    op.drop_column("payment_cards", "stripe_customer_id")
