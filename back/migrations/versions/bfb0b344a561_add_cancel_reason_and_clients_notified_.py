"""add cancel_reason and clients_notified to lessons

Revision ID: bfb0b344a561
Revises: c9e3a4b5d6f7
Create Date: 2026-07-19 18:03:23.702973

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bfb0b344a561'
down_revision: Union[str, Sequence[str], None] = 'c9e3a4b5d6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('lessons', sa.Column('cancel_reason', sa.String(length=300), nullable=True))
    op.add_column(
        'lessons',
        sa.Column('clients_notified', sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('lessons', 'clients_notified')
    op.drop_column('lessons', 'cancel_reason')
