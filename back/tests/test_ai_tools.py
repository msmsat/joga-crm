"""Реестр инструментов ассистента (эпик AI-5, задача 4).

Самая дорогая ошибка эпика — обход прав через ИИ: тренер не должен получить
через ассистента то, чего не видит в интерфейсе. Поэтому проверяем не «работает
ли инструмент», а границу: что видно роли в списке, что отдаёт выборка тренеру,
и совпадают ли роли инструмента с ролями проксируемого роутера.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_tools
"""
import asyncio
import inspect
import re
import warnings
from datetime import datetime, time, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    Hall, Lesson, Operation, Service, Studio, StudioBillingPlan, StudioBookingSettings,
    StudioBranch, StudioMember, User,
)
# Уведомления и Онлайн-запись ai_tools импортирует внутри обработчиков (круг
# импортов через services.assistant) — в тесте берём их роутеры напрямую.
from routers.ai.facts import create_fact, delete_fact, list_facts
from routers.booking.settings import get_booking_settings, update_booking_settings
from routers.settings.notifications import (
    get_notification_log, get_notification_matrix, upsert_event_toggle,
)
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
    "freeze_client": ai_tools._r_freeze_client,
    # Сотрудники и Каталог (эпик AI-6, задача 10).
    "get_staff_profile": ai_tools._r_get_staff_profile,
    "create_staff": ai_tools._r_create_staff,
    "update_staff": ai_tools._r_update_staff,
    "set_staff_schedule": ai_tools._r_update_staff,
    "delete_staff": ai_tools._r_delete_staff,
    "get_catalog_settings": ai_tools._r_subscription_config,
    "create_service": ai_tools._r_create_service,
    "update_service": ai_tools._r_update_service,
    "create_hall": ai_tools._r_create_hall,
    "create_branch": ai_tools._r_create_branch,
    "create_package": ai_tools._r_create_package,
    # Карточка клиента целиком (эпик AI-6, задача 11).
    "get_client_notes": ai_tools._r_get_client_notes,
    "get_client_subscription": ai_tools._r_get_wallet,
    "add_client_tag": ai_tools._r_add_tag,
    "remove_client_tag": ai_tools._r_remove_tag,
    "add_client_note": ai_tools._r_add_note,
    "set_client_discount": ai_tools._r_create_offer,
    "add_loyalty_points": ai_tools._r_add_bonus,
    "sell_subscription": ai_tools._r_sell_subscription,
    "update_client": ai_tools._r_update_client,
    "delete_client": ai_tools._r_delete_client,
    # Финансы, Лояльность, Уведомления, Онлайн-запись (эпик AI-6, задача 12).
    "create_operation": ai_tools._r_create_operation,
    "list_operations": ai_tools._r_list_operations,
    "create_account": ai_tools._r_create_account,
    "create_counterparty": ai_tools._r_create_counterparty,
    "get_payroll": ai_tools._r_list_salaries,
    "get_finance_goals": ai_tools._r_list_goals,
    "get_loyalty_programs": ai_tools._r_loyalty_config,
    "issue_certificate": ai_tools._r_create_certificate,
    "create_promo": ai_tools._r_create_promocode,
    "get_segments": ai_tools._r_list_segments,
    "get_notification_matrix": get_notification_matrix,
    "toggle_notification_event": upsert_event_toggle,
    "get_delivery_log": get_notification_log,
    "get_booking_settings": get_booking_settings,
    "update_booking_rules": update_booking_settings,
    # Память ассистента о студии (эпик AI-6, задача 16).
    "get_studio_facts": list_facts,
    "remember_fact": create_fact,
    "forget_fact": delete_fact,
    # Роутера не проксируют: работают с картой интерфейса, доступны всем ролям.
    "ui_section": None,
    "open_ui": None,
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


def test_owner_pages_match_frontend_routes():
    """OWNER_PAGES обязан совпадать с OwnerRoute в front/src/App.tsx.

    Второй список ролей — это будущий обход прав: раздел закроют на фронте, а
    ассистент продолжит выдавать на него адрес (эпик AI-6, задача 8).
    """
    app_tsx = (Path(__file__).parents[2] / "front" / "src" / "App.tsx").read_text(encoding="utf-8")
    from_front = {
        f"/dashboard/{m.group(1)}"
        for m in re.finditer(r'<Route path="([\w-]+)" element=\{<OwnerRoute>', app_tsx)
    }
    assert from_front, "не нашли ни одного OwnerRoute — регулярка отстала от App.tsx"
    assert set(ai_tools.OWNER_PAGES) == from_front, set(ai_tools.OWNER_PAGES) ^ from_front


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

        branch = StudioBranch(studio_id=sid, name="Филиал на Вацлаваке", city="Praha")
        db.add(branch)
        await db.flush()
        db.add(Hall(studio_id=sid, branch_id=branch.id, name="Зал йоги", capacity=12))

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
        await db.execute(delete(Hall).where(Hall.studio_id == sid))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == sid))
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(StudioBookingSettings).where(StudioBookingSettings.studio_id == sid))
        await db.execute(delete(Service).where(Service.studio_id == sid))
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

            # Залы приезжают ВНУТРИ филиалов. Список /branches отдаёт только
            # hall_count, и на этом ответе ассистент называл залами сами
            # филиалы — единственное, что в нём было похоже на имя.
            rooms = await call_tool("get_rooms", {}, as_owner, db)
            halls = [h for b in rooms["branches"] for h in b["halls"]]
            assert [h["name"] for h in halls] == ["Зал йоги"], rooms

            # Сегодняшний день считается в часовом поясе студии.
            agenda = await call_tool("get_today_agenda", {}, as_owner, db)
            assert "date" in agenda and "items" in agenda

            # Карта интерфейса: секция отдаётся ДОСЛОВНО и целиком, решение
            # «нашлось/не нашлось» больше не принимает код по числу совпавших
            # подстрок (эпик AI-6, задача 4).
            section = await call_tool("ui_section", {"page": "/dashboard/clients"}, as_trainer, db)
            assert section["page"] == "/dashboard/clients", section
            assert "Заморозить" in section["section"], section
            # Секция уходит модели дословно — за вычетом служебных комментариев
            # с именами файлов модалок: они нужны только проверке check:uimap.
            assert "<!--" not in section["section"]
            for line in ai_tools.UI_SECTIONS["/dashboard/clients"].splitlines():
                if not line.startswith("<!--"):
                    assert line in section["section"], line
            # Выдуманный маршрут до обработчика не доходит: аргумент — литерал Page.
            assert "error" in await call_tool("ui_section", {"page": "/dashboard/secret"}, as_owner, db)

            # Открытие экрана — только по существующим маршрутам и интентам
            # фронта, и только там, где роль этот раздел вообще видит.
            opened = await call_tool(
                "open_ui", {"page": "/dashboard/staff", "intent": "staff.create"}, as_owner, db)
            assert opened["ui_action"] == {
                "page": "/dashboard/staff", "tab": None,
                "intent": "staff.create", "entity_id": None,
            }, opened
            assert "error" in await call_tool("open_ui", {"page": "/dashboard/secret"}, as_owner, db)
            assert "error" in await call_tool(
                "open_ui", {"page": "/dashboard/staff", "intent": "staff.teleport"}, as_owner, db)
            # Тренеру владельческий раздел не открывается.
            denied = await call_tool("open_ui", {"page": "/dashboard/finances"}, as_trainer, db)
            assert "error" in denied and "ui_action" not in denied, denied

            # ── Каталог и Сотрудники (эпик AI-6, задача 10) ──────────────────
            # Инструмент зовёт роутер целиком: услуга реально появляется в
            # каталоге, а не в обход его валидации.
            created = await call_tool(
                "create_service",
                {"name": "AI-тест услуга", "price": 1200, "duration_min": 45}, as_owner, db)
            assert created.get("id"), created
            listed = await call_tool("get_services", {}, as_owner, db)
            assert any(s["name"] == "AI-тест услуга" for s in listed["items"]), listed

            # Настройки абонементов — то самое место, где выключается заморозка.
            settings = await call_tool("get_catalog_settings", {}, as_owner, db)
            assert "allow_freeze" in settings["subscriptions"], settings

            # Тренеру и администратору настроечные инструменты не выдаются вовсе.
            owner_names = {s["function"]["name"] for s in tools_for(as_owner)}
            trainer_names = {s["function"]["name"] for s in tools_for(as_trainer)}
            assert {"create_staff", "create_service", "create_hall"} <= owner_names
            assert not ({"create_staff", "create_service", "create_hall"} & trainer_names)

            # ── Финансы и Онлайн-запись (эпик AI-6, задача 12) ────────────────
            # Направление приходит словом, в БД уходит тип роутера.
            op = await call_tool("create_operation", {
                "direction": "Расход", "title": "Аренда зала", "amount": 20_000,
                "op_date": today.isoformat(), "category": "Аренда",
            }, as_owner, db)
            assert op.get("id") and op["type"] == "out", op

            # «Сколько потратили на аренду» модель обязана брать из totals:
            # items обрезаны, и пересчёт по ним врал бы уверенно (решение 18).
            ops = await call_tool("list_operations", {"direction": "Расход"}, as_owner, db)
            assert ops["count"] >= 1, ops
            assert {"category": "Аренда", "amount": 20_000} in ops["totals"], ops["totals"]
            assert ops["currency"] == "EUR"

            # Правила записи читаются и меняются, брендинг виджета инструменту
            # недоступен вовсе — в схеме аргументов его нет.
            rules = await call_tool("get_booking_settings", {}, as_owner, db)
            assert "booking_window_days" in rules, rules
            changed = await call_tool("update_booking_rules", {"booking_window_days": 21}, as_owner, db)
            assert changed["booking_window_days"] == 21, changed
            assert "widget_accent_color" not in ai_tools.BookingRulesArgs.model_fields

            # Читающие инструменты четырёх разделов зовутся без падения. Проверка
            # тупая нарочно: половина роутеров объявляет дефолты через Query(...),
            # и прямой вызов без явного значения роняет SQLAlchemy — снаружи это
            # выглядит как «ассистент молчит», а поймать иначе негде.
            reads = {
                "get_payroll": {"period_start": today.isoformat(), "period_end": today.isoformat()},
                "get_finance_goals": {},
                "get_loyalty_programs": {},
                "get_segments": {},
                "get_notification_matrix": {},
                "get_delivery_log": {"search": "нет такого адреса"},
            }
            for name, payload in reads.items():
                got = await call_tool(name, payload, as_owner, db)
                assert "error" not in got, (name, got)
                # Тренеру ни один из них не отдаётся — раздел владельческий.
                assert "error" in await call_tool(name, payload, as_trainer, db), name
    finally:
        await _cleanup(sid)


def test_ai_tools_scope():
    asyncio.run(_run())


if __name__ == "__main__":
    test_tool_roles_match_routers()
    test_trainer_sees_no_owner_tools()
    asyncio.run(_run())
    print("ALL PASS")
