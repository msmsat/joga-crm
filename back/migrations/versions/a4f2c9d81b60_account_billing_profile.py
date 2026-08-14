"""account billing profile (address + vat on users)

Revision ID: a4f2c9d81b60
Revises: 397ec646abb9
Create Date: 2026-08-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4f2c9d81b60'
down_revision: Union[str, Sequence[str], None] = '397ec646abb9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Реквизиты плательщика живут на аккаунте, а не на студии: у двух студий одного
# владельца платёжный адрес один и тот же.
_COLUMNS = (
    ('billing_country', 2),
    ('billing_line1', 200),
    ('billing_line2', 200),
    ('billing_postal_code', 20),
    ('billing_city', 100),
    ('billing_vat_id', 30),
)


def upgrade() -> None:
    """Upgrade schema."""
    for name, length in _COLUMNS:
        op.add_column('users', sa.Column(name, sa.String(length=length), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    for name, _ in reversed(_COLUMNS):
        op.drop_column('users', name)
