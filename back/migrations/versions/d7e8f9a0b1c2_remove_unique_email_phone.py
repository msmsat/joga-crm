"""remove unique constraints from users email and phone

Revision ID: d7e8f9a0b1c2
Revises: c1d2e3f4a5b6
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'd7e8f9a0b1c2'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.execute("DROP INDEX IF EXISTS ix_users_phone")
    op.create_index('ix_users_email', 'users', ['email'], unique=False)
    op.create_index('ix_users_phone', 'users', ['phone'], unique=False)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_phone")
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.create_index('ix_users_phone', 'users', ['phone'], unique=True)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
