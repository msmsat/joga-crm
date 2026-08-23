"""EPIC 7, Задача 1: реальный экспорт вкладки «Данные» (взамен вкладки
`setTimeout`-имитаций). Генератор CSV — `services/exporter.py` (эпик 4),
локализация заголовков — по образцу `routers/billing/router.py`.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from activity import log_activity
from database import get_db
from dependencies import StudioContext, require_role
from models import Client, ClientSubscription, Lesson, Operation
from schemas.settings.data import ExportEstimateOut, ExportKind
from services.exporter import csv_stream
from services.i18n import pick
from services.members import member_name
from services.notifier import _CURRENCY_SIGNS, _studio_prefs

router = APIRouter()

# Жёсткий потолок на выгрузку одним файлом — см. критерии приёмки эпика.
# Больше — 413 с просьбой сузить период, а не зависшая ручка на всю студию разом.
MAX_EXPORT_ROWS = 100_000

# Шапки и словари значений — на всех пяти языках продукта (services/i18n):
# выгрузку открывают в Excel, и «Registration date» в чешской студии выглядит
# ровно так же чуждо, как выглядело бы «Дата регистрации».
_HEADERS = {
    "clients": {
        "ru": ["ID", "Имя", "Фамилия", "Телефон", "Email", "Дата рождения", "Статус", "Теги",
               "Визиты", "Сумма покупок, {cur}", "Дата регистрации"],
        "en": ["ID", "Name", "Last name", "Phone", "Email", "Birth date", "Status", "Tags",
               "Visits", "Total spent, {cur}", "Registration date"],
        "uk": ["ID", "Ім'я", "Прізвище", "Телефон", "Email", "Дата народження", "Статус", "Теги",
               "Візити", "Сума покупок, {cur}", "Дата реєстрації"],
        "cs": ["ID", "Jméno", "Příjmení", "Telefon", "Email", "Datum narození", "Stav", "Štítky",
               "Návštěvy", "Útrata celkem, {cur}", "Datum registrace"],
        "de": ["ID", "Vorname", "Nachname", "Telefon", "E-Mail", "Geburtsdatum", "Status", "Tags",
               "Besuche", "Umsatz gesamt, {cur}", "Registrierung"],
    },
    "schedule": {
        "ru": ["Дата и время", "Занятие", "Тренер", "Зал", "Мест", "Записано", "Посещено", "Статус"],
        "en": ["Date and time", "Lesson", "Trainer", "Hall", "Spots", "Booked", "Attended", "Status"],
        "uk": ["Дата й час", "Заняття", "Тренер", "Зал", "Місць", "Записано", "Відвідано", "Статус"],
        "cs": ["Datum a čas", "Lekce", "Lektor", "Sál", "Míst", "Rezervováno", "Účast", "Stav"],
        "de": ["Datum und Zeit", "Kurs", "Trainer", "Raum", "Plätze", "Gebucht", "Anwesend", "Status"],
    },
    "finances": {
        "ru": ["Дата", "Тип", "Категория", "Сумма, {cur}", "Метод", "Счёт", "Клиент", "Статус"],
        "en": ["Date", "Type", "Category", "Amount, {cur}", "Method", "Account", "Client", "Status"],
        "uk": ["Дата", "Тип", "Категорія", "Сума, {cur}", "Метод", "Рахунок", "Клієнт", "Статус"],
        "cs": ["Datum", "Typ", "Kategorie", "Částka, {cur}", "Metoda", "Účet", "Klient", "Stav"],
        "de": ["Datum", "Art", "Kategorie", "Betrag, {cur}", "Methode", "Konto", "Kunde", "Status"],
    },
    "subscriptions": {
        "ru": ["Клиент", "Пакет", "Остаток", "Срок", "Статус"],
        "en": ["Client", "Package", "Remaining", "Expires", "Status"],
        "uk": ["Клієнт", "Пакет", "Залишок", "Термін", "Статус"],
        "cs": ["Klient", "Balíček", "Zbývá", "Platnost do", "Stav"],
        "de": ["Kunde", "Paket", "Rest", "Gültig bis", "Status"],
    },
}

_CLIENT_STATUS = {
    "ru": {"new": "Новый", "active": "Активный", "vip": "VIP", "inactive": "Неактивный"},
    "en": {"new": "New", "active": "Active", "vip": "VIP", "inactive": "Inactive"},
    "uk": {"new": "Новий", "active": "Активний", "vip": "VIP", "inactive": "Неактивний"},
    "cs": {"new": "Nový", "active": "Aktivní", "vip": "VIP", "inactive": "Neaktivní"},
    "de": {"new": "Neu", "active": "Aktiv", "vip": "VIP", "inactive": "Inaktiv"},
}
_LESSON_STATUS = {
    "ru": {"confirmed": "Подтверждено", "pending": "Ожидает", "cancelled": "Отменено"},
    "en": {"confirmed": "Confirmed", "pending": "Pending", "cancelled": "Cancelled"},
    "uk": {"confirmed": "Підтверджено", "pending": "Очікує", "cancelled": "Скасовано"},
    "cs": {"confirmed": "Potvrzeno", "pending": "Čeká", "cancelled": "Zrušeno"},
    "de": {"confirmed": "Bestätigt", "pending": "Ausstehend", "cancelled": "Abgesagt"},
}
_OPERATION_TYPE = {
    "ru": {"in": "Приход", "out": "Расход"},
    "en": {"in": "Income", "out": "Expense"},
    "uk": {"in": "Надходження", "out": "Витрата"},
    "cs": {"in": "Příjem", "out": "Výdaj"},
    "de": {"in": "Einnahme", "out": "Ausgabe"},
}
# is_frozen перекрывает status (заморозка — отдельный флаг в модели, не значение status).
_SUB_STATUS = {
    "ru": {"frozen": "Заморожен", "active": "Активен"},
    "en": {"frozen": "Frozen", "active": "Active"},
    "uk": {"frozen": "Заморожено", "active": "Активний"},
    "cs": {"frozen": "Zmrazeno", "active": "Aktivní"},
    "de": {"frozen": "Pausiert", "active": "Aktiv"},
}


def _date_range(column, date_from: date | None, date_to: date | None) -> list:
    """Общий фильтр по датам: верхняя граница исключающая — колонки бывают
    datetime (Client.registration_date, Lesson.start_time), а date_to должен
    включать весь день целиком, не только полночь."""
    filters = []
    if date_from is not None:
        filters.append(column >= date_from)
    if date_to is not None:
        filters.append(column < date_to + timedelta(days=1))
    return filters


# ─── clients ──────────────────────────────────────────────────────────────

async def _count_clients(db: AsyncSession, studio_id: int, date_from, date_to) -> int:
    filters = [Client.studio_id == studio_id, *_date_range(Client.registration_date, date_from, date_to)]
    return (await db.execute(select(func.count()).select_from(Client).where(*filters))).scalar_one()


async def _rows_clients(db: AsyncSession, studio_id: int, date_from, date_to, limit: int):
    filters = [Client.studio_id == studio_id, *_date_range(Client.registration_date, date_from, date_to)]
    return (await db.execute(
        select(Client).where(*filters)
        .options(selectinload(Client.reservations), selectinload(Client.payments))
        .order_by(Client.id).limit(limit)
    )).scalars().all()


def _clients_csv_rows(clients, lang: str):
    labels = pick(_CLIENT_STATUS, lang)
    for c in clients:
        visits = sum(1 for r in c.reservations if r.status == "attended")
        spent = sum(p.amount for p in c.payments if p.status == "success")
        yield [
            c.id, c.name, c.last_name or "", c.phone or "", c.email or "",
            c.birth_date.strftime("%d.%m.%Y") if c.birth_date else "",
            labels.get(c.status, c.status),
            ", ".join(c.tags or []),
            visits,
            f"{spent / 100:.2f}",
            c.registration_date.strftime("%d.%m.%Y") if c.registration_date else "",
        ]


# ─── schedule ─────────────────────────────────────────────────────────────

async def _count_schedule(db: AsyncSession, studio_id: int, date_from, date_to) -> int:
    filters = [Lesson.studio_id == studio_id, *_date_range(Lesson.start_time, date_from, date_to)]
    return (await db.execute(select(func.count()).select_from(Lesson).where(*filters))).scalar_one()


async def _rows_schedule(db: AsyncSession, studio_id: int, date_from, date_to, limit: int):
    filters = [Lesson.studio_id == studio_id, *_date_range(Lesson.start_time, date_from, date_to)]
    return (await db.execute(
        select(Lesson).where(*filters)
        .options(selectinload(Lesson.hall), selectinload(Lesson.reservations))
        .order_by(Lesson.start_time).limit(limit)
    )).scalars().all()


def _schedule_csv_rows(lessons, lang: str):
    labels = pick(_LESSON_STATUS, lang)
    for l in lessons:
        booked = sum(1 for r in l.reservations if r.status in ("active", "attended"))
        attended = sum(1 for r in l.reservations if r.status == "attended")
        yield [
            l.start_time.strftime("%d.%m.%Y %H:%M"), l.name, l.teacher_name,
            l.hall.name if l.hall else "",
            l.total_spots, booked, attended,
            labels.get(l.status, l.status),
        ]


# ─── finances ─────────────────────────────────────────────────────────────

async def _count_finances(db: AsyncSession, studio_id: int, date_from, date_to) -> int:
    filters = [Operation.studio_id == studio_id, *_date_range(Operation.op_date, date_from, date_to)]
    return (await db.execute(select(func.count()).select_from(Operation).where(*filters))).scalar_one()


async def _rows_finances(db: AsyncSession, studio_id: int, date_from, date_to, limit: int):
    filters = [Operation.studio_id == studio_id, *_date_range(Operation.op_date, date_from, date_to)]
    return (await db.execute(
        select(Operation).where(*filters)
        .options(selectinload(Operation.account), selectinload(Operation.client))
        .order_by(Operation.op_date.desc()).limit(limit)
    )).scalars().all()


def _finances_csv_rows(ops, lang: str):
    type_labels = pick(_OPERATION_TYPE, lang)
    for o in ops:
        client_name = f"{o.client.name} {o.client.last_name or ''}".strip() if o.client else ""
        yield [
            o.op_date.strftime("%d.%m.%Y"),
            type_labels.get(o.type, o.type),
            o.category,
            f"{o.amount / 100:.2f}",
            o.method,
            o.account.name if o.account else "",
            client_name,
            o.status,
        ]


# ─── subscriptions ────────────────────────────────────────────────────────
# ClientSubscription без своего studio_id — скоуп через join на Client.

async def _count_subscriptions(db: AsyncSession, studio_id: int, date_from, date_to) -> int:
    filters = [Client.studio_id == studio_id, *_date_range(ClientSubscription.created_at, date_from, date_to)]
    return (await db.execute(
        select(func.count()).select_from(ClientSubscription).join(Client).where(*filters)
    )).scalar_one()


async def _rows_subscriptions(db: AsyncSession, studio_id: int, date_from, date_to, limit: int):
    filters = [Client.studio_id == studio_id, *_date_range(ClientSubscription.created_at, date_from, date_to)]
    return (await db.execute(
        select(ClientSubscription).join(Client).where(*filters)
        .options(selectinload(ClientSubscription.client))
        .order_by(ClientSubscription.id).limit(limit)
    )).scalars().all()


def _subscriptions_csv_rows(subs, lang: str):
    labels = pick(_SUB_STATUS, lang)
    for s in subs:
        client_name = f"{s.client.name} {s.client.last_name or ''}".strip()
        status_label = labels["frozen"] if s.is_frozen else labels.get(s.status, s.status)
        yield [client_name, s.type, s.total_classes - s.used_classes,
               s.expires_at.strftime("%d.%m.%Y"), status_label]


_COUNTERS = {
    "clients": _count_clients,
    "schedule": _count_schedule,
    "finances": _count_finances,
    "subscriptions": _count_subscriptions,
}


@router.get("/data/export/estimate", response_model=ExportEstimateOut)
async def export_estimate(
    kind: ExportKind,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = await _COUNTERS[kind](db, ctx.studio_id, date_from, date_to)
    return ExportEstimateOut(rows=rows)


@router.get("/data/export")
async def export_data(
    kind: ExportKind,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    total = await _COUNTERS[kind](db, ctx.studio_id, date_from, date_to)
    if total > MAX_EXPORT_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"Слишком много записей ({total}) — сузьте диапазон дат",
        )

    lang, currency = await _studio_prefs(db, ctx.studio_id)
    sign = _CURRENCY_SIGNS.get(currency, currency)
    header = [h.format(cur=sign) for h in pick(_HEADERS[kind], lang)]

    if kind == "clients":
        rows = await _rows_clients(db, ctx.studio_id, date_from, date_to, MAX_EXPORT_ROWS)
        body = _clients_csv_rows(rows, lang)
    elif kind == "schedule":
        rows = await _rows_schedule(db, ctx.studio_id, date_from, date_to, MAX_EXPORT_ROWS)
        body = _schedule_csv_rows(rows, lang)
    elif kind == "finances":
        rows = await _rows_finances(db, ctx.studio_id, date_from, date_to, MAX_EXPORT_ROWS)
        body = _finances_csv_rows(rows, lang)
    else:
        rows = await _rows_subscriptions(db, ctx.studio_id, date_from, date_to, MAX_EXPORT_ROWS)
        body = _subscriptions_csv_rows(rows, lang)

    # Приватность (§ задачи 1): экспорт отдаёт персональные данные студии целиком —
    # факт выгрузки логируем в ленту событий, это единственный след при разборе утечки.
    log_activity(db, ctx.studio_id, "export", f"Экспорт данных: {kind}",
                 actor_name=await member_name(db, ctx.studio_id, ctx.user.id))
    await db.commit()

    fname = f"velora-{kind}-{date.today().isoformat()}.csv"
    return StreamingResponse(
        csv_stream(header, body), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
