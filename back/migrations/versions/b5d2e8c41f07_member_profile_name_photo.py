"""members: имя и фото сотрудника — профиль СТУДИИ, а не аккаунта

Продолжение docs/ROADMAP_ACCOUNTS (решение 9, после решения 7): на studio_members
переезжает последнее, что мешало одному аккаунту работать в двух студиях —
отображаемое имя и фото. `users.name` при этом остаётся: это личное имя аккаунта
(профиль, переключатель аккаунтов, письма), а не подпись в чужой команде.

Данные не теряются: имя копируется с аккаунта в каждое членство. downgrade()
снимает колонки, поэтому студийные имена, разошедшиеся с личными, при откате
пропадают — на момент миграции они одинаковы, дальше расходятся.

Revision ID: b5d2e8c41f07
Revises: a7f3c1b95e42
Create Date: 2026-07-31
"""
from alembic import op
import sqlalchemy as sa


revision = "b5d2e8c41f07"
down_revision = "a7f3c1b95e42"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # nullable=True на добавлении: колонку с NOT NULL в непустую таблицу не влить.
    op.add_column("studio_members", sa.Column("name", sa.String(length=100), nullable=True))
    op.add_column("studio_members", sa.Column("last_name", sa.String(length=100), nullable=True))
    op.add_column("studio_members", sa.Column("photo_url", sa.String(length=500), nullable=True))

    conn.execute(sa.text("""
        UPDATE studio_members m
           SET name = u.name, last_name = u.last_name, photo_url = u.photo_url
          FROM users u
         WHERE u.id = m.user_id
    """))

    # Аккаунт без имени — исторический мусор (битые регистрации). NOT NULL ниже
    # на нём упадёт, а бросать миграцию из-за пустой строки незачем: подставляем
    # email, он у аккаунта есть всегда и человека опознаёт.
    conn.execute(sa.text("""
        UPDATE studio_members m
           SET name = split_part(u.email, '@', 1)
          FROM users u
         WHERE u.id = m.user_id AND (m.name IS NULL OR btrim(m.name) = '')
    """))

    op.alter_column("studio_members", "name", nullable=False)


def downgrade() -> None:
    op.drop_column("studio_members", "photo_url")
    op.drop_column("studio_members", "last_name")
    op.drop_column("studio_members", "name")
