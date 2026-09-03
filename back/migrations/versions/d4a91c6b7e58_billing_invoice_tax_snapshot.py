"""billing invoice tax snapshot

Снимок налогового решения на строке счёта: исход, основание, ставка, сумма налога,
юрисдикция, версия правил и короткий след «на чём основано».

Зачем колонки, а не JSON: по ним считается бухгалтерская выгрузка и по ним же
разбирается спор о сумме — оба сценария требуют фильтров и группировок, а не
разбора текста. Все поля nullable: счета, выставленные при автоматическом расчёте
Stripe, снимка не имеют, и подставлять им задним числом сегодняшнее правило нельзя.

Revision ID: d4a91c6b7e58
Revises: a7c1e94f2b60
Create Date: 2026-09-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd4a91c6b7e58'
down_revision: Union[str, Sequence[str], None] = 'a7c1e94f2b60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("tax_outcome", sa.String(length=24)),
    ("tax_basis", sa.String(length=48)),
    ("tax_rate_percent", sa.Float()),
    ("tax_amount", sa.Integer()),
    ("tax_currency", sa.String(length=3)),
    ("tax_jurisdiction", sa.String(length=8)),
    ("tax_ruleset_version", sa.String(length=32)),
    ("tax_evidence", sa.String(length=400)),
)


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column("billing_invoices", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _type in reversed(_COLUMNS):
        op.drop_column("billing_invoices", name)
