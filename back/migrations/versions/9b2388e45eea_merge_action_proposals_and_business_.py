"""merge action_proposals and business_subtype heads

Две ветки выросли из `c3e8a1f7b204` в разных коммитах: `f061d8187ad4`
(action proposals) и `b3f7c20d91ae` (widen studio business_subtype). Схемы они
не пересекают, но `alembic upgrade head` при двух головах отказывается работать
целиком — а он стоит командой контейнера `api`, поэтому прод уходил в петлю
перезапуска ещё до uvicorn.

Ревизия пустая намеренно: она сшивает граф, а не меняет схему.

Revision ID: 9b2388e45eea
Revises: b3f7c20d91ae, f061d8187ad4
Create Date: 2026-09-07
"""
from typing import Sequence, Union

revision: str = '9b2388e45eea'
down_revision: Union[str, Sequence[str], None] = ('b3f7c20d91ae', 'f061d8187ad4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
