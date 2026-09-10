"""provider_message_id: 128 -> 255 (Instagram mid не влезал)

Instagram возвращает идентификатор отправленного сообщения длиной 164 символа.
Колонка была VARCHAR(128), и запись УСПЕШНОГО исхода падала с
StringDataRightTruncation уже ПОСЛЕ того, как Meta приняла сообщение. Строка
оставалась в состоянии `sending`, а `sending` в треде блокирует все следующие
сообщения этого разговора (services/outbound._blocked) — одно сообщение
запирало переписку с клиентом целиком и молча.

Ширина с запасом: Meta нигде не обещает предельную длину mid.

Revision ID: d1c4e8b70a35
Revises: 6cdd4f27a359
"""
from alembic import op
import sqlalchemy as sa

revision = "d1c4e8b70a35"
down_revision = "6cdd4f27a359"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "outbound_messages", "provider_message_id",
        existing_type=sa.String(length=128), type_=sa.String(length=255),
        existing_nullable=True,
    )


def downgrade() -> None:
    # Сузить обратно можно только обрезав то, что уже не влезает: иначе ALTER
    # упадёт на первой же живой строке с длинным mid.
    op.execute("UPDATE outbound_messages SET provider_message_id = left(provider_message_id, 128)")
    op.alter_column(
        "outbound_messages", "provider_message_id",
        existing_type=sa.String(length=255), type_=sa.String(length=128),
        existing_nullable=True,
    )
