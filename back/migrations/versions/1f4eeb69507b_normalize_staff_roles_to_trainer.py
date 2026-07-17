"""normalize staff roles to trainer

Revision ID: 1f4eeb69507b
Revises: 12244da73046
Create Date: 2026-07-14 13:34:30.692200

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1f4eeb69507b'
down_revision: Union[str, Sequence[str], None] = '12244da73046'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE studio_members
        SET role = 'trainer'
        WHERE role NOT IN ('owner', 'admin')
    """)


def downgrade() -> None:
    raise RuntimeError(
        "Cannot safely downgrade role normalization: the original role values "
        "were intentionally collapsed into 'trainer'."
    )
