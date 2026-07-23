"""certificate_config_service_id

Эпик V5-2, задача 8: сертификат «На услугу» хранил свободный текст
service_name (хардкод фронта ['Йога', 'Пилатес', ...]) — заменяем на FK
service_id на реальные услуги студии (services.id). Данные мигрируем
по совпадению названия услуги в рамках той же студии; несовпавшие
(нестандартные, "Медитация"/"TRX" которых нет в каталоге по умолчанию,
или услуга уже удалена) остаются null — сертификат становится
непривязанным, ничего не падает.

Revision ID: efcf29e955c8
Revises: bdbba7bc4623
Create Date: 2026-07-18 14:27:34.594496

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'efcf29e955c8'
down_revision: Union[str, Sequence[str], None] = 'bdbba7bc4623'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'studio_certificate_configs',
        sa.Column('service_id', sa.Integer(), sa.ForeignKey('services.id', ondelete='SET NULL'), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE studio_certificate_configs cfg "
        "SET service_id = s.id "
        "FROM services s "
        "WHERE s.studio_id = cfg.studio_id AND s.name = cfg.service_name"
    ))
    op.drop_column('studio_certificate_configs', 'service_name')


def downgrade() -> None:
    op.add_column(
        'studio_certificate_configs',
        sa.Column('service_name', sa.String(length=100), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE studio_certificate_configs cfg "
        "SET service_name = s.name "
        "FROM services s "
        "WHERE s.id = cfg.service_id"
    ))
    op.drop_column('studio_certificate_configs', 'service_id')
