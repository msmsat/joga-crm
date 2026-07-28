"""lesson gcal event id

Revision ID: 712ef52a466b
Revises: ab036aec5531
Create Date: 2026-07-28 12:00:50.089020

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '712ef52a466b'
down_revision: Union[str, Sequence[str], None] = 'ab036aec5531'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('lessons', sa.Column('gcal_event_id', sa.String(length=120), nullable=True))
    op.create_index(op.f('ix_lessons_gcal_event_id'), 'lessons', ['gcal_event_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_lessons_gcal_event_id'), table_name='lessons')
    op.drop_column('lessons', 'gcal_event_id')
