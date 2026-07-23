"""client invite_code

Revision ID: 9c473c688f70
Revises: a6da51b9cae7
Create Date: 2026-07-20 23:05:00.919920

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c473c688f70'
down_revision: Union[str, Sequence[str], None] = 'a6da51b9cae7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('clients', sa.Column('invite_code', sa.String(length=12), nullable=True))
    op.create_index(op.f('ix_clients_invite_code'), 'clients', ['invite_code'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_clients_invite_code'), table_name='clients')
    op.drop_column('clients', 'invite_code')
