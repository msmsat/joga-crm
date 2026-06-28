"""normalize owner role from Владелец to owner

Revision ID: c1d2e3f4a5b6
Revises: a1b2c3d4e5f6
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE studio_members SET role = 'owner' WHERE role = 'Владелец'")


def downgrade() -> None:
    op.execute("UPDATE studio_members SET role = 'Владелец' WHERE role = 'owner'")
