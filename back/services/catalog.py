"""Канонический каталог студии — один серверный ответ на «что вообще есть» (P1.3).

ЗАЧЕМ ОТДЕЛЬНЫЙ СЛОЙ. До сих пор «какие занятия существуют» знали три разных
места: расписание мини-приложения, публичный веб-виджет и Журнал. Каждое
собирало ответ само, и совпадали они по счастливому совпадению. Следующему
слою (поиску) нужно не четвёртое такое место, а ОДИН источник, из которого он
берёт факты, не угадывая связей между сущностями.

Каталог детерминирован: модели здесь нет и быть не может, сети — тоже. Он
отвечает фактами из базы, а разговаривать с человеком — не его дело.

ЧТО ЧЕМ ЯВЛЯЕТСЯ В ЭТОМ ПРОДУКТЕ (выяснено чтением схемы, а не по названиям):

  * Направление  = `Service`. Именно на него ссылается занятие (`service_id`),
    и именно его название копируется в `Lesson.name` при создании. Копия —
    ПРЕЗЕНТАЦИЯ: переименовали услугу, а у старых занятий осталось прежнее имя.
    Поэтому тождество направления — `service_id`, и только он.
  * Филиал       = `StudioBranch`. У ЗАНЯТИЯ ЕГО НЕТ: `Lesson` не хранит
    branch_id вовсе. Филиал занятия выводится через зал (`hall.branch_id`), и
    у занятия без зала филиала нет — не «главный», а НЕТ.
  * Зал          = `Hall`. Принадлежит студии и (необязательно) филиалу.
  * Тренер       = аккаунт `User`, на который ссылается `Lesson.teacher_id`,
    а подпись и роль доступа — из `StudioMember` этой студии. Тождество
    тренера — `users.id` (так ссылается занятие), не id членства.
  * Занятие      = `Lesson`, одно конкретное проведение. Повторяющихся
    шаблонов в продукте нет: каждое занятие заводится отдельной строкой.

ВИДИМОСТЬ. Каталог не изобретает своих правил: `visible_lessons()` — то самое
условие, которым расписание мини-приложения отбирает занятия дня, и оба места
берут его отсюда. Разъехаться им теперь нечем: показать клиенту одно, а
ассистенту другое — худший из возможных исходов.

МЕСТА. `taken_spots()` — тот же счёт занятых мест, что у мини-приложения и
веб-виджета: место держит любая бронь, кроме отменённой. Каталог отдаёт СНИМОК:
между чтением и подтверждением брони место успевает уйти, и обещать его нельзя.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import NamedTuple, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    BranchWorkingHours, Hall, Lesson, Reservation, Service, Studio, StudioBranch,
    StudioMember, StudioWorkingHours,
)
from services import lesson_time, studio_time
from services.members import full_name

# Бронь занимает место, пока она не отменена. Одно выражение на весь продукт:
# «pending» (ждёт подтверждения тренером) и «attended» место ДЕРЖАТ, и любая
# вторая формулировка этого правила рано или поздно разойдётся с первой.
OCCUPIES_SPOT = Reservation.status != "cancelled"


def visible_lessons(studio_id: int, day_from: datetime, day_to: datetime) -> list:
    """Условия «занятие видно клиенту» — общие для витрины и каталога.

    Ровно то, что фильтрует расписание мини-приложения, и ничего сверх:
    отменённое занятие не показываем, остальное показываем. Отдельного
    «скрыто / не опубликовано» в продукте нет, и выдумывать его здесь нельзя —
    каталог обязан показывать то же, что клиент видит своими глазами.

    Границы — СТЕННОЕ время студии, полуоткрытый интервал [from, to).
    """
    return [
        Lesson.studio_id == studio_id,
        Lesson.status != "cancelled",
        Lesson.start_time >= day_from,
        Lesson.start_time < day_to,
    ]


# ─── Справочники ─────────────────────────────────────────────────────────────

class BranchRef(NamedTuple):
    id: int
    name: str
    city: Optional[str]
    address: Optional[str]


class ServiceRef(NamedTuple):
    id: int
    name: str
    duration_min: int
    price: int
    category: Optional[str]
    # Описание направления, написанное ВЛАДЕЛЬЦЕМ. Публичное: витрина отдаёт
    # его гостю без всякой авторизации (routers/booking/public.PublicService).
    # Наш текст его не дополняет — показываем ровно то, что написали.
    description: Optional[str] = None


class TrainerRef(NamedTuple):
    """id — аккаунт (`users.id`), которым ссылается занятие; name — подпись
    ЭТОЙ студии (`StudioMember`), под которой человек стоит в её журнале."""
    id: int
    name: str
    active: bool


class StudioRef(NamedTuple):
    """Карточка студии — и одновременно СПИСОК РАЗРЕШЁННОГО клиенту.

    Полей ровно столько, сколько человеку снаружи можно показать. Отдавать
    сюда ORM-строку целиком нельзя: в `Studio` лежат налоговый номер, ключи
    интеграций и платёжные реквизиты, и «сериализуем объект, лишнее не
    покажем» — это решение, принятое один раз и забытое навсегда.

    Контакты и адрес публичны и сегодня: их отдаёт витрина мини-приложения
    (`routers/booking/miniapp_studio.StudioInfo`) — это те же телефон, почта и
    сайт из Настроек → Общие, по которым клиент и связывается со студией.
    """
    id: int
    name: str
    timezone: Optional[str]
    # Зона подтверждена как IANA. False — относительные даты («завтра») считать
    # можно только приблизительно, и вышележащий слой обязан это знать.
    timezone_verified: bool
    currency: Optional[str]
    language: Optional[str]
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    # Адрес самой студии. Это ЗАПАСНОЙ источник местоположения: филиалов может
    # не быть вовсе (см. `branches`), и тогда отвечать нечем, кроме него.
    address: Optional[str] = None
    city: Optional[str] = None


async def studio(db: AsyncSession, studio_id: int) -> Optional[StudioRef]:
    row = (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one_or_none()
    if row is None:
        return None
    what = studio_time.clock(row)
    return StudioRef(row.id, row.name, row.tz_iana, what.verified, row.currency,
                     row.language, row.phone, row.email, row.website,
                     row.address, row.city)


async def branches(db: AsyncSession, studio_id: int) -> list[BranchRef]:
    rows = (await db.execute(
        select(StudioBranch)
        .where(StudioBranch.studio_id == studio_id)
        .order_by(StudioBranch.id)
    )).scalars().all()
    return [BranchRef(b.id, b.name, b.city, b.address) for b in rows]


async def services(db: AsyncSession, studio_id: int) -> list[ServiceRef]:
    """Все услуги студии.

    Фильтра «активная» здесь нет намеренно: в схеме `Service` такого поля не
    существует — ни is_active, ни archived, — и публичный виджет тоже отдаёт
    весь список. Выдумать флаг ради стройности каталога значило бы спрятать от
    ассистента направления, которые клиент прекрасно видит.
    """
    rows = (await db.execute(
        select(Service).where(Service.studio_id == studio_id).order_by(Service.id)
    )).scalars().all()
    return [ServiceRef(s.id, s.name, s.duration_min, s.price, s.category, s.description)
            for s in rows]


async def trainers(db: AsyncSession, studio_id: int) -> list[TrainerRef]:
    """Тренеры студии: членства с ролью доступа «Тренер».

    `active` — принятое приглашение (`status == "active"`). Это единственный
    признак «работает / не работает» в продукте: архива сотрудников нет,
    удаление членства физическое. Занятия отключённого тренера каталог не
    прячет — их не прячет и витрина (см. `lessons`).
    """
    rows = (await db.execute(
        select(StudioMember)
        .where(StudioMember.studio_id == studio_id, StudioMember.role == "trainer")
        .order_by(StudioMember.user_id)
    )).scalars().all()
    return [TrainerRef(m.user_id, full_name(m), m.status == "active") for m in rows]


class DayHours(NamedTuple):
    """Рабочее окно одного дня. `day` — 0=понедельник, как в БД."""
    day: int
    opens: time
    closes: time


async def working_hours(db: AsyncSession, studio_id: int) -> dict[Optional[int], tuple[DayHours, ...]]:
    """Часы работы: `{branch_id: дни}` плюс `{None: дни}` — часы самой студии.

    Два источника, потому что их два в продукте: Каталог → Филиалы задаёт часы
    каждому адресу (`BranchWorkingHours`), Настройки → Часы работы — часы
    студии целиком (`StudioWorkingHours`). Ни один из них не «главнее»: у
    студии без филиалов есть только вторые, у сети — только первые имеют смысл,
    потому что открыты адреса по-разному.

    Закрытые дни не возвращаются вовсе: «закрыто» — это отсутствие окна, а не
    окно нулевой длины. Неразборчивое время («9-00», пустая строка) молча
    отбрасывается: показать человеку часы, которых мы не смогли прочитать,
    хуже, чем не показать никаких.
    """
    out: dict[Optional[int], list[DayHours]] = {}
    branch_ids = (
        select(StudioBranch.id).where(StudioBranch.studio_id == studio_id).scalar_subquery()
    )
    rows = (await db.execute(
        select(BranchWorkingHours).where(BranchWorkingHours.branch_id.in_(branch_ids))
    )).scalars().all()
    for row in rows:
        day = _day_hours(row)
        if day is not None:
            out.setdefault(row.branch_id, []).append(day)

    studio_rows = (await db.execute(
        select(StudioWorkingHours).where(StudioWorkingHours.studio_id == studio_id)
    )).scalars().all()
    for row in studio_rows:
        day = _day_hours(row)
        if day is not None:
            out.setdefault(None, []).append(day)

    return {key: tuple(sorted(days)) for key, days in out.items()}


def _day_hours(row) -> Optional[DayHours]:
    if not row.is_open or not (0 <= row.day_of_week <= 6):
        return None
    try:
        return DayHours(row.day_of_week, time.fromisoformat(row.open_time),
                        time.fromisoformat(row.close_time))
    except (TypeError, ValueError):
        return None


# ─── Занятия ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class LessonQuery:
    """Запрос к расписанию. Только идентификаторы и календарные границы.

    Разбирать «завтра вечером» и «на Вацлавской» — не работа каталога: слово
    превращает в id вышележащий слой, сюда приходят уже id. Границы — МЕСТНЫЕ
    КАЛЕНДАРНЫЕ ДАТЫ студии, включительно с обеих сторон; datetime здесь был бы
    ловушкой, потому что «сутки» в день перевода стрелок не 24 часа.
    """
    studio_id: int
    date_from: date
    date_to: date
    branch_ids: Sequence[int] = ()
    service_ids: Sequence[int] = ()
    trainer_ids: Sequence[int] = ()
    # Верхняя граница выборки. Не постраничность: каталог отвечает на вопрос о
    # диапазоне дат, и «следующие 200» здесь ничего не значат.
    limit: int = 500


@dataclass(frozen=True)
class LessonFacts:
    """Занятие как факт — без единой оценки и без единого придуманного поля."""
    lesson_id: int
    studio_id: int
    # None — у занятия нет зала, а значит и филиала. Не «главный», а неизвестно.
    branch_id: Optional[int]
    hall_id: Optional[int]
    # None — наследие: занятия заводились до того, как услуга стала обязательной.
    service_id: Optional[int]
    # `users.id`. None — занятие без тренера (наследие).
    trainer_id: Optional[int]

    # Подпись занятия, как её видит клиент: снимок названия услуги на момент
    # создания. Для поиска по смыслу брать service_id, не эту строку.
    display_name: str
    # Текущее название услуги — оно могло разойтись с display_name.
    service_name: Optional[str]
    trainer_name: str
    branch_name: Optional[str]
    hall_name: Optional[str]

    # Стенное время студии — то самое, что показано человеку. Есть всегда.
    local_start: datetime
    duration_min: int
    # Абсолютный момент (naive UTC). None — у занятия нет снимка зоны, и момент
    # НЕИЗВЕСТЕН (P1.2). Выдавать местное время за момент нельзя.
    instant: Optional[datetime]
    # Можно ли обещать это время как точку на оси времени.
    temporal_exact: bool

    price: int
    level: str
    equipment: str
    total_spots: int
    # Мест занято / свободно на момент чтения. СНИМОК: к подтверждению брони
    # число меняется, и каталог ничего не резервирует.
    taken_spots: int
    available_spots: int
    # Номера занятых мест (ковриков). Конкретное место выбирают при записи —
    # каталогу достаточно знать, что свободные есть.
    taken_spot_numbers: list[int] = field(default_factory=list)


def _ids(value: Sequence[int], name: str) -> list[int]:
    out = list(dict.fromkeys(value))
    if len(out) > 200:
        raise ValueError(f"{name}: слишком много идентификаторов")
    return out


async def lessons(db: AsyncSession, query: LessonQuery) -> list[LessonFacts]:
    """Занятия студии за диапазон местных дат — два запроса независимо от их числа.

    Чужая студия недостижима по построению: и сами занятия, и все связанные
    сущности отбираются условием по `studio_id` ЗАПРОСА, а не по тому, на что
    ссылается строка. Даже существуй в базе занятие с чужим залом, филиал от
    него сюда не попадёт.
    """
    if query.date_to < query.date_from:
        return []
    day_from, _ = lesson_time.local_day_bounds(query.date_from)
    _, day_to = lesson_time.local_day_bounds(query.date_to)

    conditions = visible_lessons(query.studio_id, day_from, day_to)
    if query.service_ids:
        conditions.append(Lesson.service_id.in_(_ids(query.service_ids, "service_ids")))
    if query.trainer_ids:
        conditions.append(Lesson.teacher_id.in_(_ids(query.trainer_ids, "trainer_ids")))
    if query.branch_ids:
        # Филиал занятия живёт на зале, а не на занятии, — поэтому подзапрос по
        # залам. Условие по studio_id внутри обязательно: без него филиал чужой
        # студии дотянулся бы до наших занятий через собственные залы.
        conditions.append(Lesson.hall_id.in_(
            select(Hall.id).where(
                Hall.studio_id == query.studio_id,
                Hall.branch_id.in_(_ids(query.branch_ids, "branch_ids")),
            )
        ))

    # Связанные сущности приезжают ОДНИМ запросом — иначе сотня занятий
    # означала бы сотню походов за тренером и сотню за залом. Все четыре
    # соединения ограничены студией запроса: тождество строки проверяем не
    # только по id, но и по владельцу.
    rows = (await db.execute(
        select(Lesson, Hall, StudioBranch, Service, StudioMember)
        .outerjoin(Hall, (Hall.id == Lesson.hall_id) & (Hall.studio_id == query.studio_id))
        .outerjoin(StudioBranch, (StudioBranch.id == Hall.branch_id)
                   & (StudioBranch.studio_id == query.studio_id))
        .outerjoin(Service, (Service.id == Lesson.service_id)
                   & (Service.studio_id == query.studio_id))
        .outerjoin(StudioMember, (StudioMember.user_id == Lesson.teacher_id)
                   & (StudioMember.studio_id == query.studio_id))
        .where(*conditions)
        .order_by(Lesson.start_time, Lesson.id)
        .limit(query.limit)
    )).all()
    if not rows:
        return []

    taken = await taken_spots(db, [row[0].id for row in rows])
    return [_facts(row, taken) for row in rows]


def _facts(row, taken: dict[int, list[int]]) -> LessonFacts:
    lesson, hall, branch, service, member = row
    # Снимок зоны берём с самого занятия (P1.2) — настройка студии на него не
    # влияет, и передавать студию сюда незачем.
    when = lesson_time.resolve(lesson)
    spots = taken.get(lesson.id, [])
    return LessonFacts(
        lesson_id=lesson.id,
        studio_id=lesson.studio_id,
        branch_id=branch.id if branch is not None else None,
        hall_id=hall.id if hall is not None else None,
        service_id=service.id if service is not None else None,
        trainer_id=lesson.teacher_id,
        display_name=lesson.name,
        service_name=service.name if service is not None else None,
        # Подпись с членства, если человек ещё в студии; иначе — снимок,
        # сделанный при создании занятия. Пустой подписи не бывает: в
        # расписании занятие обязано быть кем-то подписано.
        trainer_name=full_name(member) if member is not None else lesson.teacher_name,
        branch_name=branch.name if branch is not None else None,
        hall_name=hall.name if hall is not None else None,
        local_start=when.local,
        duration_min=lesson.duration_min,
        instant=when.instant,
        temporal_exact=when.exact,
        price=lesson.price,
        level=lesson.level,
        equipment=lesson.equipment,
        total_spots=lesson.total_spots,
        taken_spots=len(spots),
        available_spots=max(0, lesson.total_spots - len(spots)),
        taken_spot_numbers=sorted(spots),
    )


async def taken_spots(db: AsyncSession, lesson_ids: Sequence[int]) -> dict[int, list[int]]:
    """Занятые места по занятиям — один запрос на весь список.

    Тот же счёт, что у витрины: место держит любая бронь, кроме отменённой
    (`OCCUPIES_SPOT`). Разойтись каталог с витриной здесь не может — выражение
    одно на всех.
    """
    ids = list(lesson_ids)
    if not ids:
        return {}
    rows = (await db.execute(
        select(Reservation.lesson_id, Reservation.spot_number)
        .where(Reservation.lesson_id.in_(ids), OCCUPIES_SPOT)
    )).all()
    out: dict[int, list[int]] = {}
    for lesson_id, spot_number in rows:
        out.setdefault(lesson_id, []).append(spot_number)
    return out


async def lesson(db: AsyncSession, studio_id: int, lesson_id: int) -> Optional[LessonFacts]:
    """Одно занятие СВОЕЙ студии. Чужое — None, а не «нашлось по id».

    Отдельная функция, а не фильтр в `lessons`: у поштучного вопроса нет
    диапазона дат, а спросить по id прошедшее занятие вполне законно.
    """
    start = (await db.execute(
        select(Lesson.start_time).where(Lesson.id == lesson_id, Lesson.studio_id == studio_id)
    )).scalar_one_or_none()
    if start is None:
        return None
    day = start.date()
    found = await lessons(db, LessonQuery(studio_id=studio_id, date_from=day, date_to=day))
    return next((facts for facts in found if facts.lesson_id == lesson_id), None)
