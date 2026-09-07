"""merge hybrid booking hold and action-proposals heads

Третья независимая ветка (`9b2388e45eea`, тоже пустая: `b3f7c20d91ae` +
`f061d8187ad4`) выросла параллельно с `f30d8b6177e9` (`50105defb880` +
`b3f7c20d91ae`) — обе от одного `b3f7c20d91ae`, и граф снова разошёлся на две
головы ещё до HB-02 (docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md, HB-00/HB-02:
"не выбирать down_revision по имени старого файла"). Это не гибридная запись —
план платежей студии за занятие (P4) и action proposals — но `alembic upgrade
head` с двумя головами не идёт, и HB-02 не может выбрать down_revision.

Ревизия пустая намеренно: она сшивает граф, а не меняет схему.

Revision ID: 7628ffa12be3
Revises: f30d8b6177e9, 9b2388e45eea
Create Date: 2026-09-07
"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '7628ffa12be3'
down_revision: Union[str, Sequence[str], None] = ('f30d8b6177e9', '9b2388e45eea')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
