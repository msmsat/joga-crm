"""Внешняя личность клиента и привязка кода подтверждения к ней (P2)

Аддитивно и без переноса данных. Строки под существующих клиентов НЕ заводятся:
внешняя личность появляется только тогда, когда человек действительно написал,
и создавать её заранее значило бы записать утверждение, которого никто не
делал. Сходство телефона в подтверждённую связь тем более не превращается —
ровно это и запрещает весь P2.

Три колонки в `client_email_otp` привязывают уже существующий код к тому, КТО
его просил и КОГО он подтверждает: без них «код верен» отвечало бы на вопрос
«владеете ли вы ящиком», а не «чей это аккаунт».

Revision ID: a99d09a5abc6
Revises: c3e8a1f7b204
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a99d09a5abc6"
down_revision: Union[str, Sequence[str], None] = "c3e8a1f7b204"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FK_IDENTITY = "fk_client_email_otp_identity"
_FK_CLIENT = "fk_client_email_otp_client"


def upgrade() -> None:
    op.create_table(
        "customer_identities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("studio_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=128), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("assurance", sa.String(length=16), server_default="anonymous", nullable=False),
        sa.Column("matched_by", sa.String(length=16), nullable=True),
        sa.Column("verified_by", sa.String(length=20), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("transactional_consent", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("marketing_consent", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("pending_capability", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        # Удалили карточку — связь обрывается, а не повисает указателем в
        # никуда: висячая ссылка это право доступа без владельца.
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["studio_id"], ["studios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        # Уникальность на уровне ХРАНИЛИЩА: два сообщения одного человека
        # приходят параллельно, и «SELECT, потом INSERT» завёл бы две строки на
        # одну личность.
        sa.UniqueConstraint("studio_id", "channel", "subject", name="uq_identity_subject"),
    )
    op.create_index(op.f("ix_customer_identities_id"), "customer_identities", ["id"])
    op.create_index(op.f("ix_customer_identities_studio_id"), "customer_identities", ["studio_id"])
    op.create_index("ix_identity_client", "customer_identities", ["studio_id", "client_id"])

    op.add_column("client_email_otp", sa.Column("identity_id", sa.Integer(), nullable=True))
    op.add_column("client_email_otp", sa.Column("client_id", sa.Integer(), nullable=True))
    op.add_column("client_email_otp", sa.Column("last_sent_at", sa.DateTime(), nullable=True))
    # NULL в обеих колонках — код существующего входа по почте на форме
    # мини-приложения. Он работает как работал: привязка нужна только коду,
    # выданному по просьбе из чата.
    op.create_foreign_key(_FK_CLIENT, "client_email_otp", "clients",
                          ["client_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key(_FK_IDENTITY, "client_email_otp", "customer_identities",
                          ["identity_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    op.drop_constraint(_FK_IDENTITY, "client_email_otp", type_="foreignkey")
    op.drop_constraint(_FK_CLIENT, "client_email_otp", type_="foreignkey")
    op.drop_column("client_email_otp", "last_sent_at")
    op.drop_column("client_email_otp", "client_id")
    op.drop_column("client_email_otp", "identity_id")
    op.drop_index("ix_identity_client", table_name="customer_identities")
    op.drop_index(op.f("ix_customer_identities_studio_id"), table_name="customer_identities")
    op.drop_index(op.f("ix_customer_identities_id"), table_name="customer_identities")
    op.drop_table("customer_identities")
