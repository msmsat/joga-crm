"""studio_task assignee_id

Revision ID: 08d1e987cc4c
Revises: 4ae2c491426f
Create Date: 2026-07-26 20:50:38.077316

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '08d1e987cc4c'
down_revision: Union[str, Sequence[str], None] = '4ae2c491426f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('studio_tasks', sa.Column('assignee_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_studio_tasks_assignee_id'), 'studio_tasks', ['assignee_id'], unique=False)
    op.create_foreign_key(None, 'studio_tasks', 'users', ['assignee_id'], ['id'], ondelete='SET NULL')
    op.execute("UPDATE studio_tasks SET assignee_id = author_id WHERE assignee_id IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, 'studio_tasks', type_='foreignkey')
    op.drop_index(op.f('ix_studio_tasks_assignee_id'), table_name='studio_tasks')
    op.drop_column('studio_tasks', 'assignee_id')
