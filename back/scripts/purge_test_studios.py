"""Чистка тестового мусора из dev-БД.

Зачем: тесты создают студии и владельцев с адресами на зарезервированных
доменах (`epic5-test-...@example.invalid`, tests/test_danger_zone.py) и чистят
за собой в `finally` — но прогон, убитый на полпути, оставляет строки жить.
Дальше их каждый вечер в 20:00 подхватывает `daily_notify` и шлёт владельцу
сводку `o1`; SMTP письмо принимает, DNS домен не находит, и баунс возвращается
в ящик отправителя.

Отправку уже отсекает `mailer.is_deliverable` — этот скрипт убирает саму
причину: мёртвые студии, которые каждый тик обходит фоновый цикл.

    python -m scripts.purge_test_studios          # показать, что удалится
    python -m scripts.purge_test_studios --apply  # удалить

Удаляет только то, что подходит под ОБА признака мусора одновременно — имя
студии с тестовым префиксом ИЛИ владелец на зарезервированном домене. Живые
студии под них не попадают.
"""
import asyncio
import sys

from sqlalchemy import text

from database import async_session_maker

# LIKE-шаблоны имён, которыми тесты помечают свои студии. Точные префиксы, а не
# '%test%': студия с именем «Test Yoga» может быть настоящей.
_TEST_NAME_PATTERNS = ("__test%", "TEST-%")

_FIND = text("""
    select s.id, s.name, u.id as user_id, u.email
    from studios s
    left join studio_members sm on sm.studio_id = s.id and sm.role = 'owner'
    left join users u on u.id = sm.user_id
    where s.name like any(:patterns)
       or u.email like '%.invalid' or u.email like '%.test'
       or u.email like '%@example.com' or u.email like '%@example.org'
    order by s.id
""")


async def main(apply: bool) -> int:
    async with async_session_maker() as db:
        rows = (await db.execute(_FIND, {"patterns": list(_TEST_NAME_PATTERNS)})).all()
        # dict.fromkeys, а не set: у студии с двумя владельцами join даёт две
        # строки, и без дедупликации счётчик врал бы в большую сторону.
        studio_ids = list(dict.fromkeys(r.id for r in rows))
        # Владельцев удаляем отдельно: users не FK'ится на studios (человек может
        # состоять в нескольких студиях), каскад студии их не унесёт.
        user_ids = sorted({r.user_id for r in rows if r.user_id is not None})

        print(f"студий под удаление: {len(studio_ids)}")
        print(f"владельцев под удаление: {len(user_ids)}")
        for r in rows[:15]:
            print(f"  #{r.id:<6} {r.name:<40} owner={r.email}")
        if len(rows) > 15:
            print(f"  ... и ещё {len(rows) - 15}")

        # Контроль: что ОСТАНЕТСЯ. Список короткий — глазами видно, не задело ли
        # живую студию.
        kept = (await db.execute(
            text("""select s.id, s.name, u.email from studios s
                    left join studio_members sm on sm.studio_id = s.id and sm.role='owner'
                    left join users u on u.id = sm.user_id
                    where s.id <> all(:ids) order by s.id"""),
            {"ids": studio_ids or [0]},
        )).all()
        print(f"\nостанется студий: {len(kept)}")
        for r in kept:
            print(f"  #{r.id:<6} {r.name:<40} owner={r.email}")

        if not apply:
            print("\nэто предпросмотр — запустить с --apply, чтобы удалить")
            return 0
        if not studio_ids:
            return 0

        # Студия каскадом уносит всё studio_id-scoped (FK ondelete=CASCADE).
        await db.execute(text("delete from studios where id = any(:ids)"), {"ids": studio_ids})
        if user_ids:
            await db.execute(text("delete from users where id = any(:ids)"), {"ids": user_ids})
        await db.commit()
        print(f"\nудалено: студий {len(studio_ids)}, пользователей {len(user_ids)}")
        return len(studio_ids)


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
