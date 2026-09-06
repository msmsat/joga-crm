"""widen studio business_subtype

Направления студии выбираются НАБОРОМ: онбординг отдаёт их одной строкой через
запятую («yoga,pilates,massage»), потому что механики записи у них разные —
групповое занятие в зал, запись к мастеру, бронь помещения — и одним значением
бизнес не описывается.

Полный набор из двадцати пяти id даёт около трёхсот символов, в String(50) он не
помещался и обрезался бы молча. Расширяем до 500 — по размеру `description` рядом.
Сужение обратно безопасно только для старых однозначных значений, поэтому downgrade
сначала укорачивает данные, иначе PostgreSQL откажется менять тип.

Revision ID: b3f7c20d91ae
Revises: d4a91c6b7e58
Create Date: 2026-09-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b3f7c20d91ae'
down_revision: Union[str, Sequence[str], None] = 'd4a91c6b7e58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'studios', 'business_subtype',
        existing_type=sa.String(length=50),
        type_=sa.String(length=500),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.execute("UPDATE studios SET business_subtype = LEFT(business_subtype, 50)")
    op.alter_column(
        'studios', 'business_subtype',
        existing_type=sa.String(length=500),
        type_=sa.String(length=50),
        existing_nullable=True,
    )
