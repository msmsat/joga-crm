"""replace users.is_online with last_online_at

Revision ID: a021f100f92c
Revises: 1f4eeb69507b
Create Date: 2026-07-16 14:20:36.913417

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a021f100f92c'
down_revision: Union[str, Sequence[str], None] = '1f4eeb69507b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ponytail: autogenerate также предложил снести ix_users_phone/users_phone_key —
    # посторонний дрифт модели/БД, не относящийся к этой задаче, не трогаем его тут.
    op.add_column('users', sa.Column('last_online_at', sa.Date(), nullable=True))
    op.drop_column('users', 'is_online')


def downgrade() -> None:
    op.add_column('users', sa.Column('is_online', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False))
    op.drop_column('users', 'last_online_at')
