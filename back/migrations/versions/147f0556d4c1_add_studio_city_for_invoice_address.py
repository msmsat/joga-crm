"""add studio city for invoice address

Revision ID: 147f0556d4c1
Revises: d1c4e8b52f37
Create Date: 2026-08-11 03:15:36.847922

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '147f0556d4c1'
down_revision: Union[str, Sequence[str], None] = 'd1c4e8b52f37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('studios', sa.Column('city', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studios', 'city')
