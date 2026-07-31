"""Контакт как идентификатор аккаунта + студийные условия работы.

Проверяется не код, а ГАРАНТИЯ: unique-индексы в БД. Проверка в роутере
пробивается гонкой двух запросов и обходится любым новым эндпоинтом, поэтому
тест бьёт прямо в базу и ждёт IntegrityError.

Вторая половина — регрессия на docs/ROADMAP_ACCOUNTS решение 7: один человек в
двух студиях имеет РАЗНЫЕ ставку и график, и правка одной студией не затирает
другую.

Реальная БД. Первый сценарий — транзакция с откатом; второй идёт через
`create_staff`, который коммитит сам, поэтому убирает за собой явно.
SMTP не задействован.

Запуск из back/:  python -m tests.test_contact_uniqueness
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from contact_format import normalize_email, to_e164
from database import async_session_maker
from models import StaffWorkingHours, Studio, StudioMember, User


# ─── Чистая часть: канон записи ───────────────────────────────────────────────

def test_write_canon():
    assert normalize_email("  Ivan@Mail.RU ") == "ivan@mail.ru"

    # Разделители снимаются, код страны сохраняется.
    assert to_e164("+7 (999) 123-45-67") == "+79991234567"
    assert to_e164("+420 722 274 620") == "+420722274620"
    # Ручной российский набор с ведущей 8.
    assert to_e164("8 999 123 45 67") == "+79991234567"
    # Идемпотентность — миграция прогоняет ту же логику по существующим строкам.
    assert to_e164(to_e164("+380950883622")) == "+380950883622"
    assert to_e164("") is None and to_e164(None) is None

    # Локальный номер без кода страны НЕ достраивается наугад: чешский
    # 0722274620 не должен молча стать российским.
    for bad in ("0722274620", "+7999", "123"):
        try:
            to_e164(bad)
        except ValueError:
            continue
        raise AssertionError(f"должно было отклониться: {bad!r}")

    print("  канон записи: ok")


# ─── Часть с БД ───────────────────────────────────────────────────────────────

def _user(email: str, **kw) -> User:
    return User(email=email, hashed_password="x", name="T", **kw)


async def _expect_conflict(session, obj, what: str) -> None:
    """Вставка obj должна упереться в unique-индекс. Savepoint, чтобы сессия жила."""
    try:
        async with session.begin_nested():
            session.add(obj)
            await session.flush()
    except IntegrityError:
        print(f"  {what}: отклонено базой ok")
        return
    raise AssertionError(f"{what}: БД пропустила дубль — unique-индекс не работает")


async def run() -> None:
    test_write_canon()

    async with async_session_maker() as session:
        a = Studio(name="UQ-A", business_type="fitness")
        b = Studio(name="UQ-B", business_type="fitness")
        session.add_all([a, b])
        await session.flush()

        person = _user("uq-person@test.local", phone="+420722000001", tg_id=990000001)
        session.add(person)
        await session.flush()

        # 1. Контакт = идентификатор: email, телефон и telegram глобально уникальны.
        await _expect_conflict(session, _user("uq-person@test.local"), "дубль email")
        await _expect_conflict(
            session, _user("uq-other@test.local", phone="+420722000001"), "дубль телефона")
        await _expect_conflict(
            session, _user("uq-other2@test.local", tg_id=990000001), "дубль tg_id")

        # 2. Пустые контакты не конфликтуют — partial-индекс: телефон и telegram
        #    есть не у каждого сотрудника, и несколько NULL законны.
        session.add_all([
            _user("uq-nophone1@test.local"),
            _user("uq-nophone2@test.local"),
        ])
        await session.flush()
        print("  несколько сотрудников без телефона: ok")

        # 3. Один аккаунт — две студии, условия работы разные.
        ma = StudioMember(user_id=person.id, studio_id=a.id, role="trainer", name="Аня в A",
                          rate=1000.0, rate_type="hourly", department="pilates")
        mb = StudioMember(user_id=person.id, studio_id=b.id, role="admin", name="Анна Б.",
                          rate=2500.0, rate_type="fixed", department="admin")
        session.add_all([ma, mb])
        await session.flush()

        # Второе членство в ТОЙ ЖЕ студии — ошибка (uq_studio_member).
        await _expect_conflict(
            session, StudioMember(user_id=person.id, studio_id=a.id, role="trainer", name="дубль"),
            "второе членство в одной студии")

        rows = (await session.execute(
            select(StudioMember).where(StudioMember.user_id == person.id)
        )).scalars().all()
        assert len(rows) == 2, f"ожидалось 2 членства, получено {len(rows)}"
        by_studio = {m.studio_id: m for m in rows}
        assert by_studio[a.id].rate == 1000.0 and by_studio[a.id].rate_type == "hourly"
        assert by_studio[b.id].rate == 2500.0 and by_studio[b.id].rate_type == "fixed"
        assert by_studio[a.id].department != by_studio[b.id].department
        print("  разные ставка/должность в двух студиях: ok")

        # 4. График — тоже по студиям: один и тот же день недели в двух студиях.
        session.add_all([
            StaffWorkingHours(user_id=person.id, studio_id=a.id, day_of_week=0,
                              is_open=True, open_time="09:00", close_time="14:00"),
            StaffWorkingHours(user_id=person.id, studio_id=b.id, day_of_week=0,
                              is_open=True, open_time="16:00", close_time="21:00"),
        ])
        await session.flush()
        print("  один день недели в двух студиях: ok")

        # А вот дважды один день в ОДНОЙ студии — нельзя (uq_staff_studio_day).
        await _expect_conflict(
            session,
            StaffWorkingHours(user_id=person.id, studio_id=a.id, day_of_week=0,
                              is_open=True, open_time="10:00", close_time="12:00"),
            "два графика на один день в одной студии")

        # 5. Правка расписания студией B не затрагивает студию A — та самая
        #    порча данных, из-за которой перенос полей нельзя было отложить.
        for wh in (await session.execute(
            select(StaffWorkingHours).where(
                StaffWorkingHours.user_id == person.id,
                StaffWorkingHours.studio_id == b.id,
            )
        )).scalars().all():
            wh.open_time = "18:00"
        await session.flush()

        kept = (await session.execute(
            select(StaffWorkingHours).where(
                StaffWorkingHours.user_id == person.id,
                StaffWorkingHours.studio_id == a.id,
            )
        )).scalars().all()
        assert [w.open_time for w in kept] == ["09:00"], "график студии A затёрт"
        print("  правка графика в B не тронула A: ok")

        await session.rollback()
        print("\nоткат выполнен, данные не оставлены")


# ─── Привязка существующего аккаунта (решение 8) ──────────────────────────────

# Метки тестовых данных: create_staff внутри делает commit, поэтому откатом
# здесь не обойтись — за собой надо убирать явно.
ATT_EMAILS = ("att-owner@veloratest.ru", "att-trainer@veloratest.ru")
ATT_STUDIOS = ("ATT-home", "ATT-guest")


async def _cleanup_attach() -> None:
    """Удалить данные attach-сценария. Членства и графики уходят по ON DELETE CASCADE."""
    async with async_session_maker() as session:
        await session.execute(delete(User).where(User.email.in_(ATT_EMAILS)))
        await session.execute(delete(Studio).where(Studio.name.in_(ATT_STUDIOS)))
        await session.commit()


async def run_attach() -> None:
    """POST /staff на известный контакт ПРИВЯЗЫВАЕТ человека, а не плодит аккаунт.

    Проверяется поведение самого эндпоинта, а не только схема: это единственная
    точка, где создаётся сотрудник, и раньше она отвечала 409.

    ВНИМАНИЕ: `create_staff` внутри вызывает `db.commit()`, поэтому этот сценарий,
    в отличие от первого, реально пишет в БД. Уборка — в `finally`, а не rollback:
    после коммита откатывать нечего.
    """
    import importlib

    from dependencies import StudioContext
    from schemas.settings.team import StaffCreate

    profiles = importlib.import_module("routers.staff.profiles")

    # Остатки от прогона, упавшего на середине, иначе упрёмся в свой же unique.
    await _cleanup_attach()
    try:
        async with async_session_maker() as session:
            home = Studio(name="ATT-home", business_type="fitness")
            guest = Studio(name="ATT-guest", business_type="fitness")
            session.add_all([home, guest])
            await session.flush()

            owner = _user("att-owner@veloratest.ru")
            trainer = _user("att-trainer@veloratest.ru", phone="+420722000077")
            session.add_all([owner, trainer])
            await session.flush()
            session.add_all([
                StudioMember(user_id=owner.id, studio_id=guest.id, role="owner", name="Хозяин"),
                # Тренер уже работает в другой (home) студии со своей ставкой.
                StudioMember(user_id=trainer.id, studio_id=home.id, role="trainer", name="Родное Имя",
                             rate=800.0, rate_type="hourly", department="yoga"),
            ])
            await session.flush()

            ctx = StudioContext(user=owner, studio_id=guest.id, role="owner")
            payload = StaffCreate(
                name="Чужое Имя", last_name="Перетёрто", email="att-trainer@veloratest.ru",
                phone="+420 722 000 077", password="Velora7pq", role="admin",
                department="admin", rate=1700.0, rate_type="fixed", schedule=[],
            )

            # check_plan_limit, notify и письмо-приглашение ходят в биллинг и SMTP —
            # здесь не нужны (и слать реальное письмо на тестовый адрес нельзя).
            profiles.check_plan_limit = lambda *a, **k: asyncio.sleep(0)
            profiles.notify = lambda *a, **k: asyncio.sleep(0)

            async def _no_mail(*a, **k):
                return "https://example.test/join?token=stub"
            profiles.send_invite = _no_mail

            # Проверка контакта ДО добавления: человек существует, но в этой студии
            # его нет. Форма добавления смотрит на in_studio, поэтому не должна
            # блокироваться — иначе привязка недостижима через интерфейс.
            for field, value in (("email", "att-trainer@veloratest.ru"),
                                 ("phone", "+420 722 000 077")):
                answer = await profiles.check_staff_contact(
                    field=field, value=value, exclude_id=None, ctx=ctx, db=session)
                assert answer["taken"] is True, f"{field}: аккаунт не найден"
                assert answer["in_studio"] is False, f"{field}: ложный конфликт со студией"
            print("  контакт из чужой студии: taken=True, in_studio=False ok")

            # Неизвестный контакт — оба флага сняты.
            answer = await profiles.check_staff_contact(
                field="email", value="nobody-here@veloratest.ru",
                exclude_id=None, ctx=ctx, db=session)
            assert answer == {"taken": False, "in_studio": False}, answer
            print("  незнакомый контакт: оба флага сняты ok")

            result = await profiles.create_staff(payload, ctx=ctx, db=session)
            assert result["ok"] is True

            # После привязки тот же контакт в той же студии — уже конфликт.
            answer = await profiles.check_staff_contact(
                field="email", value="att-trainer@veloratest.ru",
                exclude_id=None, ctx=ctx, db=session)
            assert answer["in_studio"] is True, "членство в студии не распознано"
            print("  после привязки: in_studio=True ok")

            users = (await session.execute(
                select(User).where(User.email == "att-trainer@veloratest.ru")
            )).scalars().all()
            assert len(users) == 1, f"аккаунт продублирован: {len(users)} строк"
            print("  второй аккаунт не создан: ok")

            rows = (await session.execute(
                select(StudioMember).where(StudioMember.user_id == trainer.id)
            )).scalars().all()
            assert len(rows) == 2, f"ожидалось 2 членства, получено {len(rows)}"
            by_studio = {m.studio_id: m for m in rows}
            assert by_studio[guest.id].role == "admin"
            assert by_studio[guest.id].rate == 1700.0
            # Условия в прежней студии не тронуты — та самая порча данных.
            assert by_studio[home.id].rate == 800.0, "ставка в home-студии затёрта"
            assert by_studio[home.id].department == "yoga", "должность в home-студии затёрта"
            print("  привязан ко второй студии, условия первой целы: ok")

            # Личные данные чужого аккаунта владелец не перезаписывает.
            await session.refresh(trainer)
            assert trainer.name != "Чужое Имя", "владелец перетёр имя чужого аккаунта"
            assert trainer.hashed_password == "x", "владелец перезадал пароль чужого аккаунта"
            print("  личные данные и пароль чужого аккаунта не тронуты: ok")

            # Решение 9: имя, которое ввёл владелец, легло в ЕГО студию — и только
            # в неё. В прежней студии человек подписан по-прежнему.
            assert by_studio[guest.id].name == "Чужое Имя", "имя не попало в профиль студии"
            assert by_studio[home.id].name == "Родное Имя", "имя в home-студии затёрто"
            print("  имя студийное: своё в guest, прежнее в home: ok")

            # Повторное добавление в ТУ ЖЕ студию — настоящая ошибка.
            from fastapi import HTTPException
            try:
                await profiles.create_staff(payload, ctx=ctx, db=session)
            except HTTPException as e:
                assert e.status_code == 409, f"ожидался 409, получен {e.status_code}"
                print("  повторное добавление в ту же студию: 409 ok")
            else:
                raise AssertionError("повторное добавление прошло без 409")
    finally:
        await _cleanup_attach()
        print("\nтестовые данные удалены")


async def run_all() -> None:
    """Оба сценария в ОДНОМ event loop.

    Движок в database.py глобальный, и его пул привязан к тому loop, в котором
    открылся. Два отдельных asyncio.run() оставляют пул от первого, уже
    закрытого, loop → AttributeError в транспорте asyncpg.
    """
    await run()
    print()
    await run_attach()


def test_contact_uniqueness():
    asyncio.run(run_all())


if __name__ == "__main__":
    asyncio.run(run_all())
    print("\ntest_contact_uniqueness: ok")
