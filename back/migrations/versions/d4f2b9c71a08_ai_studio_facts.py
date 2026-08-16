"""ai_studio_facts — память ассистента о студии (эпик AI-6, задача 16)

Revision ID: d4f2b9c71a08
Revises: c8a1d5e73f04
Create Date: 2026-08-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f2b9c71a08'
down_revision: Union[str, Sequence[str], None] = 'c8a1d5e73f04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Короткий список фактов студии, которые ассистент помнит между диалогами.
    # studio_id — CASCADE: студию удалили, помнить больше не о ком.
    # author_user_id — SET NULL: сотрудник ушёл, а факт про студию остаётся.
    op.create_table(
        'ai_studio_facts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('studio_id', sa.Integer(), nullable=False),
        sa.Column('text', sa.String(length=200), nullable=False),
        sa.Column('author_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ai_studio_facts_id'), 'ai_studio_facts', ['id'])
    op.create_index(op.f('ix_ai_studio_facts_studio_id'), 'ai_studio_facts', ['studio_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_ai_studio_facts_studio_id'), table_name='ai_studio_facts')
    op.drop_index(op.f('ix_ai_studio_facts_id'), table_name='ai_studio_facts')
    op.drop_table('ai_studio_facts')
