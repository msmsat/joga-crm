"""add user tg_id

Revision ID: e79cb1b532c1
Revises: 4d1656fe48c9
Create Date: 2026-07-24 20:55:10.866481

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e79cb1b532c1'
down_revision: Union[str, Sequence[str], None] = '4d1656fe48c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('tg_id', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'tg_id')
