"""Инструменты ассистента (эпик AI-5, задача 4).

Разница между чат-болталкой и ассистентом — и одновременно главная дыра
безопасности, если сделать небрежно. Два правила, из которых растёт весь модуль:

1. **Инструмент не пишет свой SQL — он зовёт функцию роутера.** Запись клиента
   на занятие в этом проекте не INSERT, а цепочка из шести шагов (списание с
   абонемента, уведомления c1/a1/t1, реферальные бонусы, лимит тарифа). Свой
   запрос отключил бы их молча, и данные выглядели бы правильными ровно до
   конца месяца.
2. **`roles` инструмента совпадают с ролями проксируемого роутера один в один.**
   Расхождение в любую сторону — либо мёртвый инструмент в промпте (лишние
   токены и «модель тупит»), либо обход прав.

Аргументы приходят от модели, `ctx` — от сервера, и не смешиваются: ни один
инструмент не принимает `studio_id`, `user_id` или `role` параметром, иначе
достаточно уговорить модель подставить чужой `studio_id`.
"""
import json
import logging
import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable, Literal, Optional

from fastapi import HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import ALGORITHM, SECRET_KEY, StudioContext
from models import Studio
from routers.analytics._filters import ReportFilters
from routers.analytics.overview import analytics_overview
from routers.analytics.reports import period_summary
from routers.clients.profiles import (
    create_client as _r_create_client,
    freeze_client as _r_freeze_client,
    get_client as _r_get_client,
    get_client_events as _r_get_client_events,
    list_clients as _r_list_clients,
)
from routers.finances.accounts import list_accounts as _r_list_accounts
from routers.loyalty.cards import get_stats as _r_loyalty_stats
from routers.schedule.lessons import (
    create_lesson as _r_create_lesson,
    get_lesson as _r_get_lesson,
    list_lessons as _r_list_lessons,
)
from routers.schedule.reservations import (
    cancel_reservation as _r_cancel_reservation,
    create_reservation as _r_create_reservation,
)
from routers.staff.profiles import list_staff as _r_list_staff
from routers.studio.router import get_branches as _r_get_branches
from routers.studio.services import list_services as _r_list_services
from schemas.clients.clients import ClientCreate, ClientFreezeUpdate
from schemas.schedule.lessons import LessonCreateRequest
from schemas.schedule.reservations import ReservationCreate
from services.daily_notify import _studio_tz
from services.llm import TIER_FAST, TIER_SMART

logger = logging.getLogger(__name__)

ALL_ROLES = ("owner", "admin", "trainer")

# Результат инструмента обрезаем: get_schedule за год иначе положит в контекст
# мегабайт и превратит один вопрос в счёт на доллар.
_MAX_ITEMS = 50
_MAX_JSON_CHARS = 4000

# Фолбэки региональных настроек: все три поля Studio nullable — у студии, не
# дошедшей до последнего шага онбординга, там None, и первый же вопрос про
# завтрашний день падал бы на None в арифметике дат.
_DEFAULT_TZ = "UTC"
_DEFAULT_CURRENCY = "EUR"

# Карта интерфейса (задача 5): читается один раз при импорте, а не на каждый
# запрос. Целиком уезжает в кэшируемый префикс системного промпта — 4K токенов
# в кэше дешевле и точнее, чем эмбеддинги со своей инфраструктурой.
# ponytail: карта целиком в промпте вместо поиска по ней; вводить поиск, когда
# карта перевалит за ~15K токенов.
UI_MAP = Path(__file__).with_name("ai_uimap.md").read_text(encoding="utf-8")

# Маршруты фронта — сверено с front/src/App.tsx. Enum, а не свободная строка:
# инструмент навигации не должен уметь отправить человека на выдуманный адрес.
Page = Literal[
    "/dashboard",
    "/dashboard/journal",
    "/dashboard/clients",
    "/dashboard/staff",
    "/dashboard/catalog",
    "/dashboard/booking",
    "/dashboard/finances",
    "/dashboard/loyalty",
    "/dashboard/reports",
    "/dashboard/notifications",
    "/dashboard/ai",
    "/dashboard/settings",
    "/dashboard/billing",
    "/dashboard/profile",
]

TOOLS: dict[str, "Tool"] = {}


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    params: type[BaseModel]      # Pydantic-схема аргументов
    handler: Callable            # async (ctx: StudioContext, db, args) -> dict
    mutating: bool
    roles: tuple[str, ...]
    tier_hint: str = TIER_FAST


def tool(*, mutating: bool = False, roles: tuple[str, ...] = ALL_ROLES, tier_hint: str = TIER_FAST):
    """Регистрирует функцию как инструмент.

    JSON-схема берётся из Pydantic-модели аргументов (аннотация параметра `args`),
    описание — из докстринга. Руками схемы не пишем: они разъедутся с кодом на
    второй неделе.
    """
    def deco(fn: Callable) -> Callable:
        params = fn.__annotations__.get("args")
        if params is None or not issubclass(params, BaseModel):
            raise TypeError(f"{fn.__name__}: параметр args должен быть аннотирован Pydantic-моделью")
        TOOLS[fn.__name__] = Tool(
            name=fn.__name__,
            description=(fn.__doc__ or "").strip(),
            params=params,
            handler=fn,
            mutating=mutating,
            roles=roles,
            tier_hint=tier_hint,
        )
        return fn
    return deco


# ─── Схемы аргументов ─────────────────────────────────────────────────────────
# Даты приходят от модели строками и регулярно приезжают кривыми («завтра»,
# 2026-13-45) — валидирует Pydantic, а не datetime.fromisoformat в обработчике.

class NoArgs(BaseModel):
    pass


class ScheduleArgs(BaseModel):
    date_from: date
    date_to: date
    hall_id: Optional[int] = None
    trainer_id: Optional[int] = None


class LessonArgs(BaseModel):
    lesson_id: int


class FindClientsArgs(BaseModel):
    query: str = ""
    limit: int = Field(10, ge=1, le=50)


class ClientArgs(BaseModel):
    client_id: int


class ClientEventsArgs(BaseModel):
    client_id: int
    limit: int = Field(20, ge=1, le=50)


class PeriodArgs(BaseModel):
    period: Literal["today", "week", "month", "year"] = "month"


class CreateLessonArgs(BaseModel):
    service_id: int
    teacher_id: int
    start_time: datetime
    hall_id: Optional[int] = None
    duration_min: int = 60
    total_spots: int = 8
    price: int = 0


class BookClientArgs(BaseModel):
    lesson_id: int
    client_id: int


class CancelBookingArgs(BaseModel):
    reservation_id: int


class CreateClientArgs(BaseModel):
    name: str
    phone: str
    email: str
    city: str
    last_name: Optional[str] = None
    birth_date: Optional[date] = None
    source: Optional[str] = None


class FreezeArgs(BaseModel):
    client_id: int
    frozen: bool = True


class HowToArgs(BaseModel):
    topic: str


class NavigateArgs(BaseModel):
    page: Page


# ─── Общие хелперы ────────────────────────────────────────────────────────────

async def studio_context_facts(db: AsyncSession, studio_id: int) -> dict:
    """Часовой пояс, валюта, язык и сегодняшняя дата студии — для промпта и
    для инструментов. «Записи на завтра» считаются в Studio.timezone, иначе в
    студии на UTC+3 после 21:00 ассистент отвечает за позавчера."""
    studio = (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one_or_none()
    tz_name = (studio.timezone if studio else None) or _DEFAULT_TZ
    today = datetime.now(_studio_tz(tz_name)).date()
    return {
        "studio_name": studio.name if studio else "",
        "timezone": tz_name,
        "currency": (studio.currency if studio else None) or _DEFAULT_CURRENCY,
        "language": (studio.language if studio else None) or "ru",
        "today": today.isoformat(),
    }


async def _today(db: AsyncSession, studio_id: int) -> date:
    return date.fromisoformat((await studio_context_facts(db, studio_id))["today"])


async def _currency(db: AsyncSession, studio_id: int) -> str:
    return (await studio_context_facts(db, studio_id))["currency"]


def _dump(value):
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, (list, tuple)):
        return [_dump(v) for v in value]
    if isinstance(value, dict):
        return {k: _dump(v) for k, v in value.items()}
    return value


def _items(rows, *, limit: int = _MAX_ITEMS, currency: str | None = None) -> dict:
    """Список -> результат инструмента с обрезкой по числу записей и по объёму JSON.

    Валюта отдаётся отдельным полем, а не приклеивается к числам: правило §8
    CLAUDE.md запрещает форматирование валюты вне UI, а модель, получив голое
    число, допишет знак по своему усмотрению.
    """
    data = _dump(rows)
    if isinstance(data, dict):
        data = data.get("items", data)      # Page[...] -> собственно список
    if not isinstance(data, list):
        data = [data]

    total = len(data)
    data = data[:limit]
    while data and len(json.dumps(data, ensure_ascii=False)) > _MAX_JSON_CHARS:
        data = data[:-1]

    result: dict = {"items": data, "count": total}
    if len(data) < total:
        result["truncated"] = True
        result["note"] = "Показаны не все записи — сузьте период или запрос."
    if currency:
        result["currency"] = currency
    return result


def _period_range(period: str, today: date) -> tuple[date, date]:
    if period == "today":
        return today, today
    if period == "week":
        return today - timedelta(days=6), today
    if period == "year":
        return today.replace(month=1, day=1), today
    return today.replace(day=1), today


# ─── Читающие инструменты ─────────────────────────────────────────────────────

@tool()
async def get_schedule(ctx: StudioContext, db: AsyncSession, args: ScheduleArgs) -> dict:
    """Расписание занятий студии за период дат. Тренер видит только свои занятия.
    Отдаёт название, время, тренера, зал, число мест и сколько уже записано."""
    rows = await _r_list_lessons(
        date_from=args.date_from, date_to=args.date_to, hall_id=args.hall_id, ctx=ctx, db=db,
    )
    if args.trainer_id is not None:
        rows = [r for r in rows if getattr(r, "teacher_id", None) == args.trainer_id]
    return _items(rows, currency=await _currency(db, ctx.studio_id))


@tool()
async def get_lesson(ctx: StudioContext, db: AsyncSession, args: LessonArgs) -> dict:
    """Подробности одного занятия и список записанных на него клиентов."""
    return _dump(await _r_get_lesson(lesson_id=args.lesson_id, ctx=ctx, db=db))


@tool()
async def find_clients(ctx: StudioContext, db: AsyncSession, args: FindClientsArgs) -> dict:
    """Поиск клиентов студии по имени, телефону или email. Тренеру отдаёт
    только его клиентов. Возвращает id, имя, телефон, статус и абонемент."""
    page = await _r_list_clients(
        ctx=ctx, current_user=ctx.user, db=db, search=args.query or None,
        status=None, category=None, tag=None, offset=0, limit=args.limit,
    )
    return _items(page, limit=args.limit)


@tool()
async def get_client(ctx: StudioContext, db: AsyncSession, args: ClientArgs) -> dict:
    """Карточка клиента: контакты, статус, абонемент с остатком занятий,
    баллы лояльности, сумма покупок и число визитов."""
    profile = await _r_get_client(client_id=args.client_id, ctx=ctx, current_user=ctx.user, db=db)
    return {"client": _dump(profile), "currency": await _currency(db, ctx.studio_id)}


@tool()
async def get_client_events(ctx: StudioContext, db: AsyncSession, args: ClientEventsArgs) -> dict:
    """История событий клиента: оплаты, посещения, записи, отмены, заморозки."""
    rows = await _r_get_client_events(
        client_id=args.client_id, ctx=ctx, current_user=ctx.user, db=db, event_type=None,
    )
    return _items(rows, limit=args.limit, currency=await _currency(db, ctx.studio_id))


@tool(roles=("owner",), tier_hint=TIER_SMART)
async def get_stats(ctx: StudioContext, db: AsyncSession, args: PeriodArgs) -> dict:
    """Ключевые показатели студии за период: выручка, число записей, активные
    клиенты, удержание — с динамикой к прошлому периоду такой же длины."""
    date_from, date_to = _period_range(args.period, await _today(db, ctx.studio_id))
    data = await analytics_overview(
        f=ReportFilters(
            date_from=date_from, date_to=date_to,
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        ),
        ctx=ctx, db=db,
    )
    return {
        "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "currency": await _currency(db, ctx.studio_id),
        "overview": _dump(data),
    }


@tool(roles=("owner",), tier_hint=TIER_SMART)
async def get_finance_summary(ctx: StudioContext, db: AsyncSession, args: PeriodArgs) -> dict:
    """Финансовая сводка за период: доходы, расходы, средний чек и балансы
    счетов студии (касса, расчётный счёт, эквайринг)."""
    date_from, date_to = _period_range(args.period, await _today(db, ctx.studio_id))
    summary = await period_summary(date_from=date_from, date_to=date_to, ctx=ctx, db=db)
    accounts = await _r_list_accounts(ctx=ctx, db=db)
    return {
        "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "currency": await _currency(db, ctx.studio_id),
        "summary": _dump(summary),
        "accounts": _dump(accounts)[:_MAX_ITEMS],
    }


@tool()
async def get_staff(ctx: StudioContext, db: AsyncSession, args: NoArgs) -> dict:
    """Сотрудники студии: имя, должность, роль доступа и загрузка.
    Тренеру отдаёт только его самого."""
    return _items(await _r_list_staff(ctx=ctx, db=db, offset=0, limit=_MAX_ITEMS))


@tool(roles=("owner", "admin"))
async def get_services(ctx: StudioContext, db: AsyncSession, args: NoArgs) -> dict:
    """Услуги студии: название, длительность, цена, уровень сложности, оборудование."""
    return _items(await _r_list_services(ctx=ctx, db=db), currency=await _currency(db, ctx.studio_id))


@tool(roles=("owner",))
async def get_rooms(ctx: StudioContext, db: AsyncSession, args: NoArgs) -> dict:
    """Филиалы студии и залы внутри них: вместимость, площадь, оборудование."""
    return _items(await _r_get_branches(ctx=ctx, db=db), currency=await _currency(db, ctx.studio_id))


@tool(roles=("owner",))
async def get_loyalty_summary(ctx: StudioContext, db: AsyncSession, args: NoArgs) -> dict:
    """Программа лояльности: сколько участников, баллов начислено и списано,
    какой эффект дают карты."""
    return {"loyalty": _dump(await _r_loyalty_stats(ctx=ctx, db=db))}


@tool()
async def how_to(ctx: StudioContext, db: AsyncSession, args: HowToArgs) -> dict:
    """Найти в карте интерфейса, где и какими кнопками сделать то, о чём спросили
    («заморозить абонемент», «добавить зал»). Карта уже целиком есть в системном
    промпте — этот инструмент нужен, только если нужного там не нашлось."""
    # Сравниваем по шестибуквенным началам слов: русская морфология иначе
    # разводит «абонемент» и «абонемента». Порог в два совпавших слова — чтобы
    # «телепортация клиента» не находилась по одному слову «клиент» и не
    # выглядела для модели существующей функцией.
    words = [w[:6] for w in args.topic.lower().split() if len(w) > 3]
    if not words:
        return {"found": False, "note": "Уточните, что именно нужно сделать."}
    need = 2 if len(words) > 1 else 1

    scored = []
    for line in UI_MAP.splitlines():
        if not line.startswith("- "):
            continue
        score = sum(w in line.lower() for w in words)
        if score >= need:
            scored.append((score, line[2:].strip()))
    if not scored:
        return {"found": False, "note": "Такого действия в Velora нет — не выдумывай кнопку."}
    scored.sort(key=lambda p: -p[0])
    return {"found": True, "steps": [s for _, s in scored[:10]]}


@tool()
async def navigate(ctx: StudioContext, db: AsyncSession, args: NavigateArgs) -> dict:
    """Открыть раздел CRM у пользователя. Звать только когда человек прямо
    попросил перейти («открой финансы»): самовольный переход во время чтения
    ответа ощущается как потеря контроля."""
    return {"navigate": args.page}


@tool()
async def get_today_agenda(ctx: StudioContext, db: AsyncSession, args: NoArgs) -> dict:
    """Что происходит сегодня: занятия текущего дня в часовом поясе студии
    с заполненностью. Тренеру — только его занятия."""
    today = await _today(db, ctx.studio_id)
    rows = await _r_list_lessons(date_from=today, date_to=today, hall_id=None, ctx=ctx, db=db)
    result = _items(rows, currency=await _currency(db, ctx.studio_id))
    result["date"] = today.isoformat()
    return result


# ─── Изменяющие инструменты ───────────────────────────────────────────────────
# В реестре есть, но агентный цикл (задача 7) их НЕ исполняет: он собирает
# подписанное предложение, а исполняет уже человек через /ai/actions/execute.
# Роли — копия роутеров: create_reservation/cancel_reservation отбивают тренера
# в теле, create_client и freeze_client висят на require_role("owner","admin"),
# create_lesson отбивает тренера в теле.

@tool(mutating=True, roles=("owner", "admin"))
async def create_lesson(ctx: StudioContext, db: AsyncSession, args: CreateLessonArgs) -> dict:
    """Создать занятие в расписании: услуга, тренер, зал, время начала,
    длительность в минутах, число мест и цена."""
    lesson = await _r_create_lesson(
        body=LessonCreateRequest(
            service_id=args.service_id, teacher_id=args.teacher_id, hall_id=args.hall_id,
            start_time=args.start_time, duration_min=args.duration_min,
            total_spots=args.total_spots, price=args.price,
        ),
        ctx=ctx, db=db, background_tasks=None,
    )
    return {"lesson": _dump(lesson)}


@tool(mutating=True, roles=("owner", "admin"))
async def book_client(ctx: StudioContext, db: AsyncSession, args: BookClientArgs) -> dict:
    """Записать клиента студии на занятие. Списывает занятие с абонемента и
    отправляет подтверждения — как запись из Журнала."""
    reservation = await _r_create_reservation(
        body=ReservationCreate(client_id=args.client_id, lesson_id=args.lesson_id), ctx=ctx, db=db,
    )
    return {"reservation": _dump(reservation)}


@tool(mutating=True, roles=("owner", "admin"))
async def cancel_booking(ctx: StudioContext, db: AsyncSession, args: CancelBookingArgs) -> dict:
    """Снять клиента с занятия по номеру записи — освобождает место и
    возвращает занятие на абонемент."""
    reservation = await _r_cancel_reservation(reservation_id=args.reservation_id, ctx=ctx, db=db)
    return {"reservation": _dump(reservation)}


@tool(mutating=True, roles=("owner", "admin"))
async def create_client(ctx: StudioContext, db: AsyncSession, args: CreateClientArgs) -> dict:
    """Завести нового клиента студии: имя, телефон в формате +7…, email, город."""
    client = await _r_create_client(
        body=ClientCreate(
            name=args.name, last_name=args.last_name, phone=args.phone, email=args.email,
            city=args.city, birth_date=args.birth_date, source=args.source,
        ),
        ctx=ctx, current_user=ctx.user, db=db,
    )
    return {"client": _dump(client)}


@tool(mutating=True, roles=("owner", "admin"))
async def freeze_subscription(ctx: StudioContext, db: AsyncSession, args: FreezeArgs) -> dict:
    """Заморозить абонемент клиента (frozen=true) или разморозить (frozen=false).
    Срок заморозки задан настройками студии, отдельно его не указывают."""
    result = await _r_freeze_client(
        client_id=args.client_id, body=ClientFreezeUpdate(frozen=args.frozen),
        ctx=ctx, current_user=ctx.user, db=db,
    )
    return _dump(result)


# ─── Реестр ───────────────────────────────────────────────────────────────────

def _json_schema(t: Tool) -> dict:
    schema = t.params.model_json_schema()
    schema.pop("title", None)
    return {
        "type": "function",
        "function": {"name": t.name, "description": t.description, "parameters": schema},
    }


def tools_for(ctx: StudioContext) -> list[dict]:
    """Схемы инструментов, разрешённых роли. Тренер физически не видит в списке
    get_finance_summary: модель не может вызвать инструмент, о котором не знает,
    — это дешевле и надёжнее, чем ловить отказ после вызова."""
    return [_json_schema(t) for t in TOOLS.values() if ctx.role in t.roles]


def _error_text(detail) -> str:
    """HTTPException роутера -> текст для модели. «Все места заняты» — это ответ
    клиенту, а не 500 в чате."""
    if isinstance(detail, dict):
        return str(detail.get("message") or detail.get("code") or detail)
    return str(detail)


async def call_tool(name: str, args: dict, ctx: StudioContext, db: AsyncSession) -> dict:
    """Исполнить инструмент. Ошибки возвращаются текстом, а не исключением:
    модель должна получить их и переформулировать, а не уронить запрос.

    Логи без ПДн: имя, студия, длительность, размер результата. Аргументы и
    результат целиком в лог не уходят — там телефоны и даты рождения клиентов
    чужого бизнеса, а логи живут дольше и охраняются хуже базы.
    """
    t = TOOLS.get(name)
    if t is None:
        return {"error": f"Инструмента «{name}» не существует"}
    # Вторая линия обороны: tools_for уже отфильтровал список, но проверяем ещё
    # раз перед исполнением — предложение действия могло прийти из чужой сессии.
    if ctx.role not in t.roles:
        return {"error": "Недостаточно прав для этого действия"}

    try:
        parsed = t.params.model_validate(args or {})
    except ValidationError as exc:
        fields = ", ".join(".".join(str(p) for p in e["loc"]) or "?" for e in exc.errors())
        return {"error": f"Неверные аргументы ({fields}) — проверьте формат и повторите"}

    started = time.monotonic()
    try:
        result = await t.handler(ctx, db, parsed)
    except HTTPException as exc:
        logger.info("tool=%s studio=%s rejected status=%s", name, ctx.studio_id, exc.status_code)
        return {"error": _error_text(exc.detail)}
    except Exception:
        logger.exception("tool=%s studio=%s failed", name, ctx.studio_id)
        return {"error": "Не удалось выполнить запрос — попробуйте иначе"}

    size = len(json.dumps(result, ensure_ascii=False, default=str))
    logger.info(
        "tool=%s studio=%s ok %dms size=%d", name, ctx.studio_id,
        int((time.monotonic() - started) * 1000), size,
    )
    return result


# ─── Предложение изменяющего действия (задача 6) ──────────────────────────────
# Модель никогда не исполняет mutating-инструмент внутри цикла: она возвращает
# подписанное предложение, человек жмёт кнопку. Галлюцинация не должна уметь
# удалить занятие.

_ACTION_PURPOSE = "ai_action"
_ACTION_TTL = timedelta(minutes=10)


def describe_action(name: str, args: dict) -> str:
    """Человекочитаемое описание действия — для карточки подтверждения и для
    сообщения в ленте после исполнения. Берём первую фразу докстринга: весь
    он длинный, а в чате это одна строка."""
    t = TOOLS.get(name)
    title = (t.description.splitlines()[0] if t else name).split(". ")[0].rstrip(":.")
    details = ", ".join(f"{k}: {v}" for k, v in args.items() if v is not None)
    return f"{title} ({details})" if details else title


def make_action_proposal(name: str, args: dict, ctx: StudioContext, session_id: int | None) -> dict:
    """Подписанное предложение действия: {tool, args, description, token}.

    TTL обязателен — предложение, полежавшее сутки, может относиться к уже
    отменённому занятию.
    """
    token = jwt.encode(
        {
            "tool": name,
            "args": args,
            "studio_id": ctx.studio_id,
            "user_id": ctx.user.id,
            "session_id": session_id,
            "purpose": _ACTION_PURPOSE,
            "jti": str(uuid.uuid4()),
            "exp": datetime.utcnow() + _ACTION_TTL,
        },
        SECRET_KEY, algorithm=ALGORITHM,
    )
    return {"tool": name, "args": args, "description": describe_action(name, args), "token": token}


def decode_action_token(token: str, ctx: StudioContext) -> dict:
    """Payload предложения, если оно живо и принадлежит текущему пользователю.

    Сверка studio_id/user_id — не формальность: токен, украденный из чужого
    чата, не должен исполниться в этом.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="action_token_invalid")
    if (
        payload.get("purpose") != _ACTION_PURPOSE
        or payload.get("studio_id") != ctx.studio_id
        or payload.get("user_id") != ctx.user.id
        or payload.get("tool") not in TOOLS
        or not payload.get("session_id")
        or not payload.get("jti")
    ):
        raise HTTPException(status_code=400, detail="action_token_invalid")
    # Роль сверяется отдельным 403: «нет доступа» и «битый токен» — разные
    # ответы, и путать их в UI нельзя.
    if ctx.role not in TOOLS[payload["tool"]].roles:
        raise HTTPException(status_code=403, detail="Нет доступа")
    return payload


if __name__ == "__main__":
    # Самопроверка без сети и БД: реестр, ролевой скоуп, обрезка результата.
    assert len(TOOLS) == 19, sorted(TOOLS)
    assert sum(1 for t in TOOLS.values() if t.mutating) == 5

    class _Ctx:
        def __init__(self, role):
            self.role, self.studio_id, self.user = role, 1, None

    owner_names = {s["function"]["name"] for s in tools_for(_Ctx("owner"))}
    trainer_names = {s["function"]["name"] for s in tools_for(_Ctx("trainer"))}
    admin_names = {s["function"]["name"] for s in tools_for(_Ctx("admin"))}

    assert "get_finance_summary" in owner_names and "get_finance_summary" not in trainer_names
    assert "get_staff" in trainer_names                   # своя колонка в журнале нужна и тренеру
    assert "get_services" in admin_names and "get_services" not in trainer_names
    assert "get_rooms" in owner_names and "get_rooms" not in admin_names
    assert not (trainer_names & {t.name for t in TOOLS.values() if t.mutating})

    # Схема инструмента собирается из Pydantic-модели, а не пишется руками.
    schema = next(s for s in tools_for(_Ctx("owner")) if s["function"]["name"] == "get_schedule")
    assert set(schema["function"]["parameters"]["properties"]) == {
        "date_from", "date_to", "hall_id", "trainer_id",
    }
    assert schema["function"]["description"]

    # Ни один инструмент не принимает студию/пользователя/роль параметром.
    for t in TOOLS.values():
        assert not ({"studio_id", "user_id", "role"} & set(t.params.model_fields)), t.name

    # Обрезка: 50 записей максимум и 4000 символов JSON.
    big = _items([{"i": i, "pad": "x" * 200} for i in range(120)])
    assert big["count"] == 120 and big["truncated"] is True
    assert len(big["items"]) <= _MAX_ITEMS
    assert len(json.dumps(big["items"], ensure_ascii=False)) <= _MAX_JSON_CHARS
    assert _items([], currency="EUR")["currency"] == "EUR"

    # Периоды считаются от «сегодня» студии, а не от серверного дня.
    today = date(2026, 8, 13)
    assert _period_range("today", today) == (today, today)
    assert _period_range("month", today) == (date(2026, 8, 1), today)
    assert _period_range("year", today) == (date(2026, 1, 1), today)
    assert _period_range("week", today) == (date(2026, 8, 7), today)

    # Карта интерфейса прочиталась и содержит реальные маршруты фронта.
    assert len(UI_MAP) > 3000
    for page in Page.__args__:
        assert page in UI_MAP, page

    # Предложение действия: подпись, чужой пользователь, чужая студия, покойник.
    class _U:
        def __init__(self, uid):
            self.id = uid

    class _C:
        def __init__(self, sid=1, uid=7, role="owner"):
            self.studio_id, self.user, self.role = sid, _U(uid), role

    mine, other_user, other_studio = _C(), _C(uid=8), _C(sid=2)
    proposal = make_action_proposal("book_client", {"lesson_id": 5, "client_id": 3}, mine, 42)
    assert proposal["tool"] == "book_client" and proposal["token"]
    assert "5" in proposal["description"] and proposal["description"]

    payload = decode_action_token(proposal["token"], mine)
    assert payload["args"] == {"lesson_id": 5, "client_id": 3} and payload["jti"]

    for foreign in (other_user, other_studio):
        try:
            decode_action_token(proposal["token"], foreign)
            raise AssertionError("чужой токен исполнился")
        except HTTPException as exc:
            assert exc.status_code == 400 and exc.detail == "action_token_invalid"
    try:
        decode_action_token("не токен вовсе", mine)
        raise AssertionError("битый токен принят")
    except HTTPException as exc:
        assert exc.status_code == 400

    print("ai_tools self-check ok")
