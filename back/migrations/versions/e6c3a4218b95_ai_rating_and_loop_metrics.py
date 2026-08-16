"""оценка ответа + метрики цикла (эпик AI-6, задача 18)

Revision ID: e6c3a4218b95
Revises: d4f2b9c71a08
Create Date: 2026-08-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6c3a4218b95'
down_revision: Union[str, Sequence[str], None] = 'd4f2b9c71a08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Все колонки nullable: база не пустая, а NOT NULL без дефолта её просто не
    # даст обновить (запрет 6 эпика). NULL здесь и означает «не оценивали» /
    # «строка от прошлой версии».
    op.add_column('ai_chat_messages', sa.Column('rating', sa.Integer(), nullable=True))

    # Метрики цикла: какие инструменты вызывались, сколько было итераций и была
    # ли эскалация на дорогую модель. Текста промптов и ответов в ai_usage нет и
    # не появится — там ПДн клиентов чужого бизнеса.
    op.add_column('ai_usage', sa.Column('tools', sa.String(length=500), nullable=True))
    op.add_column('ai_usage', sa.Column('iterations', sa.Integer(), nullable=True))
    op.add_column('ai_usage', sa.Column('escalated', sa.Boolean(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ai_usage', 'escalated')
    op.drop_column('ai_usage', 'iterations')
    op.drop_column('ai_usage', 'tools')
    op.drop_column('ai_chat_messages', 'rating')
