"""add gateway keys to online channels

Revision ID: a6da51b9cae7
Revises: cd2197c888c3
Create Date: 2026-07-20 12:51:10.401984

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a6da51b9cae7'
down_revision: Union[str, Sequence[str], None] = 'cd2197c888c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('online_channels', sa.Column('public_key', sa.String(length=300), nullable=True))
    op.add_column('online_channels', sa.Column('secret_key', sa.String(length=300), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('online_channels', 'secret_key')
    op.drop_column('online_channels', 'public_key')
