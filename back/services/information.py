"""Справочные вопросы о студии: канонический факт либо честное «не знаю» (P1.6).

    вопрос человека
      -> модель: ВИД вопроса (services/search_intent.InfoKind) и ничего больше
      -> ПРОИСХОЖДЕНИЕ названной услуги: человек это правда сказал?
      -> ЗДЕСЬ: чтение канонического источника — каталог, часы, контакты
      -> типизированные факты -> план ответа -> рендерер

ГЛАВНОЕ ПРАВИЛО. Если ответа нет в базе, его нет и у Velora. Модель знает, что
на пилатес обычно берут удобную одежду; про ЭТУ студию она не знает ничего, и
общие знания сюда не пускаются ни при каких формулировках вопроса. Парковка,
что взять с собой, беременность, травма, «подойдёт ли мне» — у продукта нет
таких полей, поэтому нет и таких видов вопроса: перечисление закрыто, а всё
остальное называется UNSUPPORTED и уходит к человеку.

ТРИ КЛАССА ФАКТА, и они видны прямо в коде:
  A. канонический факт      — адрес, часы, цена, перечни: читаем и отвечаем;
  B. текст владельца        — описание услуги: показываем ДОСЛОВНО и не
                              дополняем (`OwnerText`, source=owner_content);
  C. ответа нет             — NOT_CONFIGURED (продукт знает такой факт, студия
                              его не заполнила) или UNSUPPORTED (продукт такого
                              факта не знает вовсе). Это РАЗНЫЕ ответы человеку.

ЧЕГО ЗДЕСЬ НЕТ. Сети. Модели. Своего SQL про расписание — справочники отдаёт
`services/catalog`. И ни одной строки, которую человек прочтёт: слова живут в
`services/response_texts`, а здесь только факты.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, time, timezone
from enum import Enum
from typing import Optional, Sequence, Union

from sqlalchemy.ext.asyncio import AsyncSession

from services import catalog, search_resolver, studio_time
from services.catalog import DayHours
from services.search_intent import InfoKind, UserSearchIntent
# Приватные помощники резолвера — намеренно они, а не своя копия: политика
# сопоставления слова человека с сущностью каталога («все слова подряд, при
# полном промахе — трёхбуквенные начала») обязана быть ОДНА на продукт.
# Вторая, написанная здесь, разошлась бы с первой на первой же опечатке.
from services.search_resolver import (
    Ambiguity, Candidate, EntityKind, _branch_haystacks, _resolve_mentions,
    _service_haystacks,
)

logger = logging.getLogger(__name__)

UTC = timezone.utc

# Сколько тёзок показать в уточняющем вопросе. Столько же, сколько показывает
# поиск: два разных ограничения на один и тот же вопрос — это баг вида «здесь
# три, а там пять».
MAX_CANDIDATES = 5


class InfoOutcome(str, Enum):
    """Исходы справки. Их семь, и все семь означают РАЗНОЕ для человека.

    Особенно NOT_CONFIGURED и UNSUPPORTED: «студия не заполнила телефон» и
    «Velora вообще не знает про парковку» — это два разных ответа, и склеить их
    значило бы сказать владельцу «заполните то, чего нет».
    """
    OK = "OK"
    # Продукт знает такой факт, студия его не заполнила.
    NOT_CONFIGURED = "NOT_CONFIGURED"
    # Названо слово, под которое подошло несколько сущностей.
    AMBIGUOUS = "AMBIGUOUS"
    # Названа сущность, которой в студии нет.
    NOT_FOUND = "NOT_FOUND"
    # Продукт такого факта не знает вовсе — к человеку.
    UNSUPPORTED = "UNSUPPORTED"
    # «Открыты сейчас?» без подтверждённой зоны: часы студии неизвестны.
    TIMEZONE_UNVERIFIED = "TIMEZONE_UNVERIFIED"
    # Модель назвала то, чего человек не говорил.
    PARSE_FAILED = "PARSE_FAILED"


# ─── Типизированные факты ────────────────────────────────────────────────────
#
# Ни одного `dict[str, Any]`. Словарь принял бы {"parking": "free"} из ответа
# модели и донёс бы его до человека; типы — не принимают, потому что типа
# «парковка» в продукте не существует.

@dataclass(frozen=True)
class PlaceRef:
    """Место, где студия физически находится. Имя может отсутствовать: у студии
    без филиалов адрес один и принадлежит ей самой."""
    name: Optional[str]
    city: Optional[str]
    address: Optional[str]


@dataclass(frozen=True)
class LocationFacts:
    places: tuple[PlaceRef, ...]


@dataclass(frozen=True)
class PlaceHours:
    """Часы одного места. `today`/`open_now` заполняются только для вопроса
    «открыты ли вы сейчас» — на «когда вы работаете» текущий момент не влияет."""
    name: Optional[str]
    week: tuple[DayHours, ...]
    today: Optional[DayHours] = None
    open_now: Optional[bool] = None


@dataclass(frozen=True)
class HoursFacts:
    places: tuple[PlaceHours, ...]


@dataclass(frozen=True)
class ContactFacts:
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None

    def known(self) -> bool:
        return bool(self.phone or self.email or self.website)


@dataclass(frozen=True)
class ServicePrice:
    name: str
    price: int
    currency: str
    duration_min: int


@dataclass(frozen=True)
class PriceFacts:
    items: tuple[ServicePrice, ...]


@dataclass(frozen=True)
class OwnerText:
    """Текст, написанный ВЛАДЕЛЬЦЕМ студии в предназначенном для этого поле.

    Показываем дословно и не дополняем ни словом: «занятия подходят для
    начинающих» — это факт студии, а «и помогают от боли в спине» — уже наша
    выдумка, даже если звучит правдоподобно. `source` фиксирует происхождение
    в самом представлении, чтобы «откуда этот абзац» не приходилось выяснять
    по логам.
    """
    title: str
    text: str
    source: str = "owner_content"


@dataclass(frozen=True)
class OwnerTextFacts:
    items: tuple[OwnerText, ...]


@dataclass(frozen=True)
class NameListFacts:
    """Перечень имён из каталога: направления или тренеры. Тёзки не
    схлопываются — в продукте это разные сущности, и витрина показывает обе."""
    names: tuple[str, ...]


Facts = Union[LocationFacts, HoursFacts, ContactFacts, PriceFacts,
              OwnerTextFacts, NameListFacts]


@dataclass(frozen=True)
class InfoResult:
    """Ответ справочного слоя. Слов нет — только факты и исход."""
    kind: InfoKind
    outcome: InfoOutcome
    facts: Optional[Facts] = None
    # Контакты студии кладём к КАЖДОМУ «не знаю»: сказать «спросите студию» и
    # не сказать как — половина ответа. Это тоже канонический факт, не выдумка.
    contact: Optional[ContactFacts] = None
    # Слова человека, под которые ничего не нашлось.
    missing: tuple[str, ...] = ()
    ambiguity: Optional[Ambiguity] = None


# ─── Разрешение ──────────────────────────────────────────────────────────────

async def resolve(db: AsyncSession, studio_id: int, intent: UserSearchIntent, *,
                  user_text: str, reference_now: datetime) -> InfoResult:
    """Справочный вопрос -> канонические факты. Студия — из контекста, не из модели.

    `reference_now` снимается ОДИН раз на ход выше: «открыты ли сейчас» и
    «какое сегодня число» обязаны отвечать по одним часам.
    """
    kind = intent.info.kind if intent.info else InfoKind.UNSUPPORTED

    # Происхождение — раньше любого чтения базы: условие, которого человек не
    # называл, не должно даже превратиться в запрос.
    if search_resolver.check_provenance(user_text, intent):
        logger.info("info_intent_resolved studio_id=%s kind=%s outcome=%s",
                    studio_id, kind.value, InfoOutcome.PARSE_FAILED.value)
        return InfoResult(kind, InfoOutcome.PARSE_FAILED)

    ref = await catalog.studio(db, studio_id)
    if ref is None:
        return InfoResult(kind, InfoOutcome.UNSUPPORTED)
    contact = ContactFacts(ref.phone, ref.email, ref.website)

    result = await _answer(db, studio_id, kind, intent, ref, contact, reference_now)
    if result.outcome is InfoOutcome.NOT_CONFIGURED:
        logger.info("info_fact_not_configured studio_id=%s kind=%s", studio_id, kind.value)
    elif result.outcome is InfoOutcome.UNSUPPORTED:
        logger.info("info_unsupported studio_id=%s", studio_id)
        logger.info("info_need_human studio_id=%s kind=%s", studio_id, kind.value)
    logger.info("info_intent_resolved studio_id=%s kind=%s outcome=%s",
                studio_id, kind.value, result.outcome.value)
    return result


async def _answer(db, studio_id: int, kind: InfoKind, intent: UserSearchIntent,
                  ref: catalog.StudioRef, contact: ContactFacts,
                  reference_now: datetime) -> InfoResult:
    if kind is InfoKind.UNSUPPORTED:
        return InfoResult(kind, InfoOutcome.UNSUPPORTED, contact=contact)

    if kind is InfoKind.CONTACT:
        if not contact.known():
            return InfoResult(kind, InfoOutcome.NOT_CONFIGURED)
        return InfoResult(kind, InfoOutcome.OK, facts=contact)

    if kind in (InfoKind.LOCATION, InfoKind.BRANCHES):
        return await _location(db, studio_id, kind, intent, ref, contact)

    if kind in (InfoKind.HOURS, InfoKind.OPEN_NOW):
        return await _hours(db, studio_id, kind, intent, ref, contact, reference_now)

    if kind is InfoKind.SERVICES:
        names = tuple(s.name for s in await catalog.services(db, studio_id))
        if not names:
            return InfoResult(kind, InfoOutcome.NOT_CONFIGURED, contact=contact)
        return InfoResult(kind, InfoOutcome.OK, facts=NameListFacts(names))

    if kind is InfoKind.TRAINERS:
        # Только принявшие приглашение: человек, который ещё не согласился
        # работать, занятий не ведёт, и называть его тренером студии рано.
        names = tuple(t.name for t in await catalog.trainers(db, studio_id) if t.active)
        if not names:
            return InfoResult(kind, InfoOutcome.NOT_CONFIGURED, contact=contact)
        return InfoResult(kind, InfoOutcome.OK, facts=NameListFacts(names))

    if kind in (InfoKind.SERVICE_PRICE, InfoKind.SERVICE_INFO):
        return await _service_fact(db, studio_id, kind, intent, ref, contact)

    # Заведённый вид вопроса без ветки выше. Отвечаем как на незнакомый: вид
    # без источника не имеет права стать ответом, и тест `_inventory` на этом
    # падает — новое значение перечисления нельзя добавить, забыв про сервер.
    return InfoResult(kind, InfoOutcome.UNSUPPORTED, contact=contact)


async def _location(db, studio_id: int, kind: InfoKind, intent: UserSearchIntent,
                    ref: catalog.StudioRef, contact: ContactFacts) -> InfoResult:
    """«Где вы находитесь» / «какие у вас филиалы».

    ПЕРВЫЙ ФИЛИАЛ НЕ ГЛАВНЫЙ. P1.3 установил это про занятия без зала, и здесь
    то же самое: у студии с двумя адресами нет «основного», поэтому называем
    оба. Выбрать за человека — отправить его не туда.
    """
    rows = await catalog.branches(db, studio_id)
    scope, ambiguity, missing = _branch_scope(intent, rows)
    if ambiguity is not None:
        return InfoResult(kind, InfoOutcome.AMBIGUOUS, ambiguity=ambiguity, contact=contact)
    if missing:
        return InfoResult(kind, InfoOutcome.NOT_FOUND, missing=missing, contact=contact)

    if kind is InfoKind.LOCATION:
        # Адрес спрашивают, чтобы приехать: филиал без адреса ответом не является.
        places = [PlaceRef(b.name, b.city, b.address) for b in scope if b.address or b.city]
    else:
        places = [PlaceRef(b.name, b.city, b.address) for b in scope]

    if not places and not intent.branch_mentions and (ref.address or ref.city):
        # Филиалов нет вовсе — остаётся адрес самой студии из Настроек.
        places = [PlaceRef(None, ref.city, ref.address)]
    if not places:
        return InfoResult(kind, InfoOutcome.NOT_CONFIGURED, contact=contact)
    return InfoResult(kind, InfoOutcome.OK, facts=LocationFacts(tuple(places)))


async def _hours(db, studio_id: int, kind: InfoKind, intent: UserSearchIntent,
                 ref: catalog.StudioRef, contact: ContactFacts,
                 reference_now: datetime) -> InfoResult:
    """«Когда вы работаете» / «вы сейчас открыты».

    Часов операционной системы здесь нет: «сейчас» — это местное время студии,
    посчитанное по её зоне IANA (P1.1). Зона не подтверждена — не отвечаем
    вовсе: «открыто» с точностью до часа два раза в год отправляет человека к
    закрытой двери.
    """
    zone = studio_time.parse(ref.timezone)
    if kind is InfoKind.OPEN_NOW and (zone is None or not ref.timezone_verified):
        return InfoResult(kind, InfoOutcome.TIMEZONE_UNVERIFIED, contact=contact)

    rows = await catalog.branches(db, studio_id)
    scope, ambiguity, missing = _branch_scope(intent, rows)
    if ambiguity is not None:
        return InfoResult(kind, InfoOutcome.AMBIGUOUS, ambiguity=ambiguity, contact=contact)
    if missing:
        return InfoResult(kind, InfoOutcome.NOT_FOUND, missing=missing, contact=contact)

    table = await catalog.working_hours(db, studio_id)
    weeks: list[tuple[Optional[str], tuple[DayHours, ...]]] = [
        (b.name, table[b.id]) for b in scope if table.get(b.id)
    ]
    if not weeks and not intent.branch_mentions and table.get(None):
        # Ни у одного филиала часов нет — берём часы студии целиком
        # (Настройки → Часы работы). Это не «главный филиал», а другой источник.
        weeks = [(None, table[None])]
    if not weeks:
        return InfoResult(kind, InfoOutcome.NOT_CONFIGURED, contact=contact)

    # Адреса разные, а часы одни и те же — повторять их построчно незачем.
    if len(weeks) > 1 and len({week for _name, week in weeks}) == 1:
        weeks = [(None, weeks[0][1])]

    if kind is InfoKind.HOURS:
        places = tuple(PlaceHours(name, week) for name, week in weeks)
        return InfoResult(kind, InfoOutcome.OK, facts=HoursFacts(places))

    local = reference_now.astimezone(zone)
    places = tuple(
        PlaceHours(name, week, today=_today(week, local), open_now=_open_at(week, local))
        for name, week in weeks
    )
    return InfoResult(kind, InfoOutcome.OK, facts=HoursFacts(places))


async def _service_fact(db, studio_id: int, kind: InfoKind, intent: UserSearchIntent,
                        ref: catalog.StudioRef, contact: ContactFacts) -> InfoResult:
    """Цена и описание НАЗВАННОГО направления.

    Цена — `Service.price`: ровно то число, что публичная витрина показывает
    гостю (`routers/booking/public.PublicService`). Персональной цены здесь
    быть не может: скидки, абонемент и пробное занятие привязаны к карточке
    клиента, а справку спрашивает кто угодно — считать её значило бы назвать
    человеку сумму, которая при оплате окажется другой.
    """
    rows = await catalog.services(db, studio_id)
    if not rows:
        return InfoResult(kind, InfoOutcome.NOT_CONFIGURED, contact=contact)

    if intent.service_mentions:
        hay, labels = _service_haystacks(rows)
        found = _resolve_mentions(EntityKind.SERVICE, intent.service_mentions, hay, labels)
        if found.ambiguities:
            return InfoResult(kind, InfoOutcome.AMBIGUOUS, ambiguity=found.ambiguities[0],
                              contact=contact)
        if found.not_found:
            return InfoResult(kind, InfoOutcome.NOT_FOUND, contact=contact,
                              missing=tuple(n.term for n in found.not_found))
        picked_ids = {*found.required_ids, *found.preferred_ids}
        picked = [s for s in rows if s.id in picked_ids]
    elif len(rows) == 1:
        picked = list(rows)
    else:
        # «Сколько стоит?» — а у студии восемь направлений по разной цене.
        # Назвать любую значит соврать семь раз из восьми.
        return InfoResult(
            kind, InfoOutcome.AMBIGUOUS, contact=contact,
            ambiguity=Ambiguity(EntityKind.SERVICE, "",
                                [Candidate(s.id, s.name) for s in rows[:MAX_CANDIDATES]]))

    if kind is InfoKind.SERVICE_PRICE:
        currency = ref.currency or "RUB"
        items = tuple(ServicePrice(s.name, s.price, currency, s.duration_min) for s in picked)
        return InfoResult(kind, InfoOutcome.OK, facts=PriceFacts(items))

    texts = tuple(OwnerText(s.name, s.description.strip())
                  for s in picked if (s.description or "").strip())
    if not texts:
        # Направление есть, а описания владелец не написал. Объяснять «что такое
        # хатха» из общих знаний нельзя: это знание модели, а не факт студии.
        return InfoResult(kind, InfoOutcome.NOT_CONFIGURED, contact=contact,
                          missing=tuple(s.name for s in picked))
    return InfoResult(kind, InfoOutcome.OK, facts=OwnerTextFacts(texts))


# ─── Помощники ───────────────────────────────────────────────────────────────

def _branch_scope(intent: UserSearchIntent, rows: Sequence[catalog.BranchRef]):
    """Филиалы, о которых спросили. Не назвали ни одного — значит, все."""
    if not intent.branch_mentions or not rows:
        return list(rows), None, ()
    hay, labels = _branch_haystacks(rows)
    found = _resolve_mentions(EntityKind.BRANCH, intent.branch_mentions, hay, labels)
    if found.ambiguities:
        return [], found.ambiguities[0], ()
    if found.not_found:
        return [], None, tuple(n.term for n in found.not_found)
    ids = {*found.required_ids, *found.preferred_ids}
    return [b for b in rows if b.id in ids], None, ()


def _today(week: Sequence[DayHours], local: datetime) -> Optional[DayHours]:
    return next((d for d in week if d.day == local.weekday()), None)


def _open_at(week: Sequence[DayHours], local: datetime) -> bool:
    """Открыто ли в этот момент. Окно, перешедшее полночь, считается за вчера.

    Ночная смена («22:00–02:00») в модели выражается тем, что закрытие раньше
    открытия. Забыть про неё значит сказать «закрыто» человеку, который стоит
    у открытой двери в час ночи.
    """
    moment, weekday = local.time(), local.weekday()
    for day in week:
        overnight = day.closes <= day.opens
        if day.day == weekday:
            if overnight and moment >= day.opens:
                return True
            if not overnight and day.opens <= moment < day.closes:
                return True
        if day.day == (weekday - 1) % 7 and overnight and moment < day.closes:
            return True
    return False


if __name__ == "__main__":
    week = (DayHours(0, time(9, 0), time(21, 0)), DayHours(4, time(22, 0), time(2, 0)))
    monday_noon = datetime(2026, 9, 7, 12, 0)          # понедельник
    assert _open_at(week, monday_noon)
    assert not _open_at(week, monday_noon.replace(hour=22))
    assert _today(week, monday_noon) == week[0]
    # Ночная смена: пятница 23:30 открыто, суббота 01:30 всё ещё открыто.
    assert _open_at(week, datetime(2026, 9, 11, 23, 30))
    assert _open_at(week, datetime(2026, 9, 12, 1, 30))
    assert not _open_at(week, datetime(2026, 9, 12, 3, 0))
    # Ни одного словаря «ключ -> факт»: типы не примут выдуманный вид факта.
    assert not hasattr(LocationFacts(()), "get")
    print("information self-check ok")
