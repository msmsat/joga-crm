"""accounts: контакт как идентификатор аккаунта + студийные поля сотрудника

Реализует docs/ROADMAP_ACCOUNTS: решения 2, 3 и 7.

Порядок шагов важен и необратим по данным:
  1. канонизировать контакты (иначе unique-индексы разъедутся на форматах);
  2. удалить исторические дубли (иначе индексы просто не создадутся);
  3. перенести студийные поля сотрудника на studio_members;
  4. только потом навесить unique-индексы.

Шаг 2 удаляет строки. downgrade() возвращает структуру, но не данные.

Revision ID: a7f3c1b95e42
Revises: c3f81a4d7e90
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa


revision = "a7f3c1b95e42"
down_revision = "c3f81a4d7e90"
branch_labels = None
depends_on = None


STUDIO_FIELDS = (
    ("department", sa.String(length=50)),
    ("salary", sa.Float()),
    ("rate", sa.Float()),
    ("rate_type", sa.String(length=20)),
)


def _fail(msg: str, rows) -> None:
    listing = "\n  ".join(repr(tuple(r)) for r in rows)
    raise RuntimeError(f"{msg}\n  {listing}\nМиграция остановлена: чинить руками.")


def upgrade() -> None:
    conn = op.get_bind()

    # ─── 1. Канонический вид контактов ───────────────────────────────────────
    # Тот же канон, что и на записи (back/contact_format.py): email в нижнем
    # регистре, телефон в E.164. Иначе «+7 999 123-45-67» и «79991234567»
    # проскочат unique-индекс как два разных номера.
    conn.execute(sa.text("UPDATE users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email))"))
    conn.execute(sa.text(r"""
        UPDATE users
           SET phone = CASE
                 WHEN regexp_replace(phone, '\D', '', 'g') = '' THEN NULL
                 ELSE '+' || regexp_replace(
                        regexp_replace(phone, '\D', '', 'g'), '^8(\d{10})$', '7\1')
               END
         WHERE phone IS NOT NULL
    """))

    # ─── 2. Исторические дубли ───────────────────────────────────────────────
    # Источник — старый Google-логин: он искал аккаунт по email И роли 'owner',
    # не находил тренера с этим адресом и создавал второй (решение 6).

    # (a) Дубль, не состоящий ни в одной студии, при живом «настоящем» аккаунте
    #     с тем же email — след незавершённой регистрации. Удаляем.
    conn.execute(sa.text("""
        DELETE FROM users u
         WHERE NOT EXISTS (SELECT 1 FROM studio_members sm WHERE sm.user_id = u.id)
           AND EXISTS (
                 SELECT 1 FROM users o
                  WHERE lower(btrim(o.email)) = lower(btrim(u.email)) AND o.id <> u.id
                    AND EXISTS (SELECT 1 FROM studio_members s2 WHERE s2.user_id = o.id))
    """))

    # (b) Дубль в той же студии, где владельцем уже числится тот же email:
    #     лишняя карточка сотрудника. Доступ не теряется — владелец остаётся.
    conn.execute(sa.text("""
        DELETE FROM users u
         USING studio_members sm, users o, studio_members smo
         WHERE sm.user_id = u.id
           AND lower(btrim(o.email)) = lower(btrim(u.email)) AND o.id <> u.id
           AND smo.user_id = o.id AND smo.studio_id = sm.studio_id
           AND smo.role = 'owner' AND sm.role <> 'owner'
    """))

    # (c) Всё, что осталось, — не наш случай. Молча переименовывать чужие
    #     контакты нельзя, поэтому падаем с перечислением.
    for col, cond in (("email", "TRUE"), ("phone", "phone IS NOT NULL"), ("tg_id", "tg_id IS NOT NULL")):
        rows = conn.execute(sa.text(f"""
            SELECT {col}, count(*), array_agg(id ORDER BY id)
              FROM users WHERE {cond}
             GROUP BY {col} HAVING count(*) > 1 LIMIT 10
        """)).fetchall()
        if rows:
            _fail(f"Остались дубли по users.{col} — их надо разобрать вручную:", rows)

    # ─── 3. Студийные поля сотрудника ────────────────────────────────────────
    # Ставка, должность и график принадлежат паре «человек + студия», а не
    # человеку: один тренер работает в двух студиях на разных условиях.

    # Пока ни у кого нет двух членств, поэтому перенос однозначен. Если это
    # изменилось — выбрать студию за владельца нельзя, останавливаемся.
    rows = conn.execute(sa.text("""
        SELECT u.id, u.email, count(sm.id)
          FROM users u JOIN studio_members sm ON sm.user_id = u.id
         WHERE u.salary IS NOT NULL OR u.rate IS NOT NULL
            OR u.rate_type IS NOT NULL OR u.department IS NOT NULL
         GROUP BY u.id, u.email HAVING count(sm.id) > 1 LIMIT 10
    """)).fetchall()
    if rows:
        _fail("Есть сотрудники в нескольких студиях с заполненной ставкой — "
              "непонятно, в какую студию её отнести:", rows)

    for name, type_ in STUDIO_FIELDS:
        op.add_column("studio_members", sa.Column(name, type_, nullable=True))
    conn.execute(sa.text("""
        UPDATE studio_members sm
           SET department = u.department, salary = u.salary,
               rate = u.rate, rate_type = u.rate_type
          FROM users u WHERE u.id = sm.user_id
    """))
    for name, _ in STUDIO_FIELDS:
        op.drop_column("users", name)

    # Рабочие часы: сироты (владелец не состоит ни в одной студии) удаляются —
    # через API они и так недостижимы, любое чтение фильтруется по studio_id.
    conn.execute(sa.text("""
        DELETE FROM staff_working_hours h
         WHERE NOT EXISTS (SELECT 1 FROM studio_members sm WHERE sm.user_id = h.user_id)
    """))
    op.add_column("staff_working_hours", sa.Column("studio_id", sa.Integer(), nullable=True))
    conn.execute(sa.text("""
        UPDATE staff_working_hours h SET studio_id = sm.studio_id
          FROM studio_members sm WHERE sm.user_id = h.user_id
    """))
    left = conn.execute(sa.text(
        "SELECT id, user_id FROM staff_working_hours WHERE studio_id IS NULL LIMIT 10")).fetchall()
    if left:
        _fail("Остались рабочие часы без студии:", left)

    op.alter_column("staff_working_hours", "studio_id", nullable=False)
    op.create_index("ix_staff_working_hours_studio_id", "staff_working_hours", ["studio_id"])
    op.create_foreign_key(
        "fk_staff_working_hours_studio", "staff_working_hours", "studios",
        ["studio_id"], ["id"], ondelete="CASCADE",
    )
    # uq_staff_day — UNIQUE CONSTRAINT, а не просто индекс: снимать надо
    # drop_constraint, иначе Postgres откажет (DependentObjectsStillExist).
    op.drop_constraint("uq_staff_day", "staff_working_hours", type_="unique")
    op.create_unique_constraint(
        "uq_staff_studio_day", "staff_working_hours",
        ["user_id", "studio_id", "day_of_week"],
    )

    # ─── 4. Уникальность контактов на уровне БД ──────────────────────────────
    # Гарантия, которую проверки в коде дать не могут: они пробиваются гонкой
    # двух параллельных запросов и обходятся любым новым эндпоинтом.
    op.drop_index("ix_users_email", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # users_phone_key существовал в БД, но не в модели (дрейф схемы) — заменяем на
    # partial с предсказуемым именем: пустая строка не должна считаться занятым
    # номером. Это тоже constraint, поэтому drop_constraint.
    op.drop_constraint("users_phone_key", "users", type_="unique")
    op.create_index(
        "uq_users_phone", "users", ["phone"], unique=True,
        postgresql_where=sa.text("phone IS NOT NULL AND phone <> ''"),
    )
    # ix_users_phone теперь избыточен: partial-индекс выше покрывает все непустые
    # телефоны, а именно по ним и идёт поиск. Лишний индекс — лишняя запись.
    op.drop_index("ix_users_phone", table_name="users")
    # tg_id — тоже контакт: notifier ищет получателя по нему, и два аккаунта с
    # одним telegram означают уведомления не тому человеку.
    op.create_index(
        "uq_users_tg_id", "users", ["tg_id"], unique=True,
        postgresql_where=sa.text("tg_id IS NOT NULL"),
    )


def downgrade() -> None:
    # Возвращается только структура. Удалённые дубли и осиротевшие рабочие
    # часы не восстанавливаются — данных для этого нет.
    op.drop_index("uq_users_tg_id", table_name="users")
    op.create_index("ix_users_phone", "users", ["phone"])
    op.drop_index("uq_users_phone", table_name="users")
    op.create_unique_constraint("users_phone_key", "users", ["phone"])
    op.drop_index("ix_users_email", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.drop_constraint("uq_staff_studio_day", "staff_working_hours", type_="unique")
    op.create_unique_constraint("uq_staff_day", "staff_working_hours", ["user_id", "day_of_week"])
    op.drop_constraint("fk_staff_working_hours_studio", "staff_working_hours", type_="foreignkey")
    op.drop_index("ix_staff_working_hours_studio_id", table_name="staff_working_hours")
    op.drop_column("staff_working_hours", "studio_id")

    for name, type_ in STUDIO_FIELDS:
        op.add_column("users", sa.Column(name, type_, nullable=True))
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE users u
           SET department = sm.department, salary = sm.salary,
               rate = sm.rate, rate_type = sm.rate_type
          FROM studio_members sm WHERE sm.user_id = u.id
    """))
    for name, _ in STUDIO_FIELDS:
        op.drop_column("studio_members", name)
