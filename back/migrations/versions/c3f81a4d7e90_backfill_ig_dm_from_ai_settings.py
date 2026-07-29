"""бэкфилл канала ig_dm из уже подключённого в AI Instagram-аккаунта

Аккаунт стал единым на всю CRM (services/instagram_account), но синхронизация
работает только с момента подключения. У студий, подключивших инсту по OAuth
раньше, токен лежит лишь в studio_ai_settings: страница AI показывает
«подключено», а Уведомления и Настройки → Интеграции просят подключить заново.
Переносим реквизиты в studio_integrations/ig_dm.

api='instagram_login' — токен из OAuth ходит только на graph.instagram.com
(см. services/notifier._send_instagram).

Живое ручное подключение (Facebook Login) не трогаем: DO UPDATE только для строк
с is_connected = false, иначе бэкфилл подменил бы рабочий токен несовместимым.

Revision ID: c3f81a4d7e90
Revises: b7d41c9f0a12
Create Date: 2026-07-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3f81a4d7e90'
down_revision: Union[str, Sequence[str], None] = 'b7d41c9f0a12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO studio_integrations (studio_id, integration_type, is_connected, config)
        SELECT s.studio_id, 'ig_dm', true, json_build_object(
                   'token', s.ig_token,
                   'ig_user_id', s.ig_user_id,
                   'username', s.ig_username,
                   'api', 'instagram_login'
               )
        FROM studio_ai_settings s
        WHERE s.ig_token IS NOT NULL AND s.ig_user_id IS NOT NULL
        ON CONFLICT (studio_id, integration_type) DO UPDATE
            SET is_connected = true, config = EXCLUDED.config
            WHERE studio_integrations.is_connected = false
    """)


def downgrade() -> None:
    """Данные, а не схема: откатывать нечего — строку ig_dm, созданную бэкфиллом,
    от подключённой руками уже не отличить, а снос живого канала хуже её наличия."""
    pass
