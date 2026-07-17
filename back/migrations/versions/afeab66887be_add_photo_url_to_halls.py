"""add_photo_url_to_halls

Revision ID: afeab66887be
Revises: e7b3107855a3
Create Date: 2026-07-17 14:51:46.391513

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'afeab66887be'
down_revision: Union[str, Sequence[str], None] = 'e7b3107855a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('halls', sa.Column('photo_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('halls', 'photo_url')
