"""loyalty level point_value

Выгода уровня: сколько денег даёт один балл при списании. У всех существующих
уровней — 1, то есть ровно прежнее поведение чека (балл гасил одну единицу
валюты). Владелец поднимает цену сам, в форме уровней.

server_default обязателен, а не только default модели: колонка NOT NULL, а
строки уже есть — без него ALTER падает на живой базе.

Revision ID: ef32901ff09f
Revises: f5b28c31a604
Create Date: 2026-08-17 01:56:54.467578

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ef32901ff09f'
down_revision: Union[str, Sequence[str], None] = 'f5b28c31a604'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('loyalty_levels', sa.Column('point_value', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('loyalty_levels', 'point_value')
