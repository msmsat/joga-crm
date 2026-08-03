"""язык интерфейса — личный, у пользователя

Язык до сих пор был только студийным (Studio.language), и менять его мог лишь
владелец через «Настройки → Основные». Администратору и тренеру эта вкладка
закрыта, а свой язык интерфейса выбрать они должны — колонка личная, рядом с
темой (users.theme).

NULL = «как в студии»: у всех существующих строк остаётся ровно прежнее
поведение, никакого бэкфилла не нужно.

Revision ID: a3f7c1d95b20
Revises: f1c48d6b2e73
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3f7c1d95b20"
down_revision: Union[str, Sequence[str], None] = "f1c48d6b2e73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("language", sa.String(length=5), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "language")
