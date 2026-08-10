"""шифрование токенов мессенджеров в базе

Колонки `tg_token` и `ig_token` теперь пишутся через `services.crypto.EncryptedStr`.
Шифротекст Fernet длиннее исходного примерно на треть плюс ~80 байт, в прежние
String(255) он не влезает — расширяем до 600 (services.crypto.SECRET_COLUMN_LEN).

Сами значения НЕ перешифровываются: `EncryptedStr` читает старые открытые строки
как есть и записывает уже зашифрованными при первом же сохранении. Так переход
проходит без простоя и без разового скрипта над боевой базой.

Revision ID: b8d3f6a1c704
Revises: f2b7c4e91a05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8d3f6a1c704"
down_revision: Union[str, Sequence[str], None] = "f2b7c4e91a05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for column in ("tg_token", "ig_token"):
        op.alter_column(
            "studio_ai_settings", column,
            existing_type=sa.String(length=255),
            type_=sa.String(length=600),
            existing_nullable=True,
        )


def downgrade() -> None:
    # Сузить колонку обратно можно только после того, как зашифрованные значения
    # из неё убраны: шифротекст длиннее 255 символов, и PostgreSQL оборвёт
    # ALTER ошибкой, а не молчаливым обрезанием. Токены при этом теряются —
    # студии переподключают каналы заново, что дешевле нечитаемого мусора в базе.
    op.execute("UPDATE studio_ai_settings SET tg_token = NULL, ig_token = NULL")
    for column in ("tg_token", "ig_token"):
        op.alter_column(
            "studio_ai_settings", column,
            existing_type=sa.String(length=600),
            type_=sa.String(length=255),
            existing_nullable=True,
        )
