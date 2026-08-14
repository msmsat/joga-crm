"""Реестр инструментов ассистента (эпик AI-5, задача 4).

Самая дорогая ошибка эпика — обход прав через ИИ: тренер не должен получить
через ассистента то, чего не видит в интерфейсе. Поэтому проверяем не «работает
ли инструмент», а границу: что видно роли в списке, что отдаёт выборка тренеру,
и совпадают ли роли инструмента с ролями проксируемого роутера.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_tools
"""
import asyncio
import inspect
import warnings
from datetime import datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Lesson, Studio, StudioBillingPlan, StudioMember, User
from services import ai_tools
from services.ai_tools import TOOLS, call_tool, tools_for

_OWNER_EMAIL = "ai-tools-owner@test.local"
_TRAINER_EMAIL = "ai-tools-trainer@test.local"

# Инструмент -> функция роутера, которую он обязан проксировать. Таблица живёт
# в тесте, а не в реестре: её задача — падать, когда роли разъедутся с
# реальностью (в первой редакции эпика разъехались четыре инструмента).
_PROXIES = {
    "get_schedule": ai_tools._r_list_lessons,
    "get_lesson": ai_tools._r_get_lesson,
    "find_clients": ai_tools._r_list_clients,
    "get_client": ai_tools._r_get_client,
    "get_client_events": ai_tools._r_get_client_events,
    "get_stats": ai_tools.analytics_overview,
    "get_finance_summary": ai_tools.period_summary,
    "get_staff": ai_tools._r_list_staff,
    "get_services": ai_tools._r_list_services,
    "get_rooms": ai_tools._r_get_branches,
    "get_loyalty_summary": ai_tools._r_loyalty_stats,
    "get_today_agenda": ai_tools._r_list_lessons,
    "create_lesson": ai_tools._r_create_lesson,
    "book_client": ai_tools._r_create_reservation,
    "cancel_booking": ai_tools._r_cancel_reservation,
    "create_client": ai_tools._r_create_client,
    "freeze_subscription": ai_tools._r_freeze_client,
    # Роутера не проксируют: работают с картой интерфейса, доступны всем ролям.
    "how_to": None,
    "navigate": None,
}


def _router_roles(fn) -> tuple[str, ...]:
    """Роли роутера из его сигнатуры: явные из require_role либо «*studio» —
    голый get_studio_context, который сужает выборку внутри себя."""
    for param in inspect.signature(fn).parameters.values():
        dep = getattr(param.default, "dependency", None)
        roles = getattr(dep, "allowed_roles", None)
        if roles:
            return tuple(roles)
    return ("*studio",)


def test_tool_roles_match_routers():
    """Роли инструмента = роли роутера один в один. Расхождение в любую сторону —
    либо мёртвый инструмент в промпте, либо обход прав."""
    assert set(_PROXIES) == set(TOOLS), set(_PROXIES) ^ set(TOOLS)
    for name, fn in _PROXIES.items():
        tool = TOOLS[name]
        if fn is None:
            assert set(tool.roles) == set(ai_tools.ALL_ROLES) and not tool.mutating, name
            continue
        roles = _router_roles(fn)
        if roles != ("*studio",):
            assert set(tool.roles) == set(roles), (name, tool.roles, roles)
        elif tool.mutating:
            # Тренера отбивает тело обработчика (create_lesson, обе ручки
            # резерваций) — статически это не видно, проверяем ровно то
            # свойство, которое было сломано в первой редакции эпика.
            assert "trainer" not in tool.roles, name
        else:
            # Роутер сам сужает выборку по роли (client_scope, фильтр тренера) —
            # закрывать инструмент строже своей же страницы незачем.
            assert set(tool.roles) == set(ai_tools.ALL_ROLES), (name, tool.roles)


def test_trainer_sees_no_owner_tools():
    trainer = {s["function"]["name"] for s in tools_for(_ctx_stub("trainer"))}
    owner = {s["function"]["name"] for s in tools_for(_ctx_stub("owner"))}
    assert not (trainer & {"get_finance_summary", "get_stats", "get_rooms", "get_loyalty_summary"})
    assert not (trainer & {t.name for t in TOOLS.values() if t.mutating})
    assert {"get_schedule", "find_clients", "get_staff", "get_today_agenda"} <= trainer
    assert len(owner) > len(trainer)


def _ctx_stub(role: str) -> StudioContext:
    return StudioContext(user=None, studio_id=0, role=role)


# ─── Поведение на реальной БД ────────────────────────────────────────────────

async def _seed() -> tuple[int, int, int]:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-TOOLS", timezone="UTC+3", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(StudioBillingPlan(studio_id=sid, plan_name="pro"))

        owner = User(email=_OWNER_EMAIL, hashed_password="x", name="Ольга")
        trainer = User(email=_TRAINER_EMAIL, hashed_password="x", name="Тимур")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=owner.id, role="owner", status="active", name="Ольга"),
            StudioMember(studio_id=sid, user_id=trainer.id, role="trainer", status="active", name="Тимур"),
        ])

        start = datetime.combine(datetime.utcnow().date(), time(10, 0)) + timedelta(days=1)
        db.add_all([
            Lesson(studio_id=sid, name="Пилатес", teacher_name="Тимур", teacher_id=trainer.id,
                   start_time=start, price=0, level="", equipment=""),
            Lesson(studio_id=sid, name="Йога", teacher_name="Ольга", teacher_id=owner.id,
                   start_time=start + timedelta(hours=2), price=0, level="", equipment=""),
        ])
        await db.commit()
        return sid, owner.id, trainer.id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email.in_([_OWNER_EMAIL, _TRAINER_EMAIL])))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid, owner_id, trainer_id = await _seed()
    try:
        async with async_session_maker() as db:
            owner = (await db.execute(select(User).where(User.id == owner_id))).scalar_one()
            trainer = (await db.execute(select(User).where(User.id == trainer_id))).scalar_one()
            as_owner = StudioContext(user=owner, studio_id=sid, role="owner")
            as_trainer = StudioContext(user=trainer, studio_id=sid, role="trainer")

            today = datetime.utcnow().date()
            window = {"date_from": today.isoformat(), "date_to": (today + timedelta(days=3)).isoformat()}

            # Выборка сужается ролью внутри самого роутера, а не фильтром поверх.
            mine = await call_tool("get_schedule", window, as_trainer, db)
            everything = await call_tool("get_schedule", window, as_owner, db)
            assert mine["count"] == 1, mine
            assert everything["count"] == 2, everything
            assert mine["items"][0]["teacher_id"] == trainer_id
            assert mine["currency"] == "EUR"

            # Инструмент владельца от тренера — ошибка текстом, а не 500 и не данные.
            denied = await call_tool("get_finance_summary", {"period": "month"}, as_trainer, db)
            assert "error" in denied and "items" not in denied, denied

            # Изменяющий инструмент тренеру недоступен так же.
            assert "error" in await call_tool(
                "book_client", {"lesson_id": 1, "client_id": 1}, as_trainer, db,
            )

            # Кривые аргументы от модели: невозможная дата и пропущенное поле.
            bad_date = await call_tool(
                "get_schedule", {"date_from": "2026-13-45", "date_to": "завтра"}, as_owner, db,
            )
            assert "error" in bad_date, bad_date
            assert "error" in await call_tool("get_lesson", {}, as_owner, db)
            assert "error" in await call_tool("no_such_tool", {}, as_owner, db)

            # Ошибка роутера приезжает текстом, а не исключением.
            missing = await call_tool("get_lesson", {"lesson_id": 999_999_999}, as_owner, db)
            assert "error" in missing, missing

            # Сегодняшний день считается в часовом поясе студии.
            agenda = await call_tool("get_today_agenda", {}, as_owner, db)
            assert "date" in agenda and "items" in agenda

            # Карта интерфейса: реальный путь на реальный вопрос и честное
            # «такого нет» на выдуманную функцию.
            howto = await call_tool("how_to", {"topic": "заморозить абонемент"}, as_trainer, db)
            assert howto["found"] and any("Заморозить" in s for s in howto["steps"]), howto
            assert not (await call_tool("how_to", {"topic": "телепортация клиента"}, as_owner, db))["found"]

            # Навигация — только по существующим маршрутам фронта.
            assert (await call_tool("navigate", {"page": "/dashboard/finances"}, as_owner, db)) == {
                "navigate": "/dashboard/finances",
            }
            assert "error" in await call_tool("navigate", {"page": "/dashboard/secret"}, as_owner, db)
    finally:
        await _cleanup(sid)


def test_ai_tools_scope():
    asyncio.run(_run())


if __name__ == "__main__":
    test_tool_roles_match_routers()
    test_trainer_sees_no_owner_tools()
    asyncio.run(_run())
    print("ALL PASS")
