"""fx_rates table + users.billing_vat_verified

Revision ID: c8a1d5e73f04
Revises: b7e3a1c46f92
Create Date: 2026-08-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8a1d5e73f04'
down_revision: Union[str, Sequence[str], None] = 'b7e3a1c46f92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Последний известный курс валют. Раньше жил в памяти процесса плюс копией во
    # ВРЕМЕННОМ файле: в контейнере тот стирается при перезапуске, и после него
    # студия, торгующая не в валюте биллинга, не попадала в счёт вовсе, пока ЕЦБ
    # не ответит. В БД он переживает и перезапуск, и недоступность провайдера.
    op.create_table(
        'fx_rates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('base', sa.String(length=3), nullable=False),
        sa.Column('code', sa.String(length=3), nullable=False),
        sa.Column('rate', sa.Float(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        # Одна строка на пару «валюта биллинга + валюта студии»: обновление курса
        # это UPSERT по ней, а не вторая строка поверх старой.
        sa.UniqueConstraint('base', 'code', name='uq_fx_rate_base_code'),
    )
    op.create_index(op.f('ix_fx_rates_id'), 'fx_rates', ['id'])
    op.create_index(op.f('ix_fx_rates_base'), 'fx_rates', ['base'])
    op.create_index(op.f('ix_fx_rates_code'), 'fx_rates', ['code'])

    # Прошёл ли сохранённый номер НДС сверку с реестром ЕС.
    #
    # Бэкофилл в TRUE для уже сохранённых номеров — не небрежность: до этой
    # ревизии непроверенный номер не сохранялся ВООБЩЕ (сверка была обязательной,
    # иначе 422). Значит каждый лежащий в базе номер VIES уже прошёл, и пометить
    # их false значило бы задним числом лишить reverse charge компании, которые
    # всё сделали правильно.
    op.add_column(
        'users',
        sa.Column('billing_vat_verified', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.execute("UPDATE users SET billing_vat_verified = true WHERE billing_vat_id IS NOT NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'billing_vat_verified')
    op.drop_index(op.f('ix_fx_rates_code'), table_name='fx_rates')
    op.drop_index(op.f('ix_fx_rates_base'), table_name='fx_rates')
    op.drop_index(op.f('ix_fx_rates_id'), table_name='fx_rates')
    op.drop_table('fx_rates')
