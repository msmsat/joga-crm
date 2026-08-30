"""Локальная резервация заявки на оплату до похода в Stripe.

Две правки одной таблицы `stripe_checkouts`, обе про одно окно:

  * `attempt_id` — НАШ идентификатор попытки оплаты. Заводится до создания
    Checkout Session и уезжает в Stripe (`client_reference_id` + метаданные),
    чтобы связь нашлась обратно даже тогда, когда id сессии записать не успели.
  * `session_id` становится NULLABLE — строка существует раньше, чем Stripe
    вернёт id. Уникальность остаётся: в Postgres несколько NULL уникальному
    индексу не мешают.

Зачем. Сессия создавалась ПЕРВОЙ, а строка заявки — второй. Падение процесса или
БД в этом окне оставляло живую платёжную форму без заявки в CRM: клиент платит,
деньги садятся на счёт студии, вебхук отвечает «заявка не найдена», продажи нет.
Узнать об этом можно было только из банковской выписки.

Аддитивно и обратимо. Бэкфилла нет: у прошлых заявок попытки не существовало, а
их `session_id` и так заполнен.

Revision ID: b7d31f4a05c9
Revises: a1c4e70b9d26
"""
import sqlalchemy as sa
from alembic import op

revision = "b7d31f4a05c9"
down_revision = "a1c4e70b9d26"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stripe_checkouts", sa.Column("attempt_id", sa.String(length=64), nullable=True))
    op.create_index("ix_stripe_checkouts_attempt_id", "stripe_checkouts", ["attempt_id"], unique=True)
    op.alter_column("stripe_checkouts", "session_id", existing_type=sa.String(length=200), nullable=True)


def downgrade() -> None:
    # Заявки без session_id (Stripe не ответил) сюда не переезжают — снимаем их
    # как отменённые: денег по ним не было, а NOT NULL иначе не вернуть.
    op.execute(
        "UPDATE stripe_checkouts SET status = 'cancelled' WHERE session_id IS NULL"
    )
    op.execute(
        "DELETE FROM stripe_checkouts WHERE session_id IS NULL"
    )
    op.alter_column("stripe_checkouts", "session_id", existing_type=sa.String(length=200), nullable=False)
    op.drop_index("ix_stripe_checkouts_attempt_id", table_name="stripe_checkouts")
    op.drop_column("stripe_checkouts", "attempt_id")
