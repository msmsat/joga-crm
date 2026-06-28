"""add_photo_url_to_branches_and_hourly_rate_to_halls

Revision ID: f94b0ed25e01
Revises: e1f2a3b4c5d6
Create Date: 2026-06-28 21:48:32.663401

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f94b0ed25e01'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('halls', sa.Column('hourly_rate', sa.Float(), nullable=True))
    op.add_column('studio_branches', sa.Column('photo_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('studio_branches', 'photo_url')
    op.drop_column('halls', 'hourly_rate')
