"""Как человека зовут В КОНКРЕТНОЙ студии.

Имя сотрудника — поле `studio_members`, а не `users` (docs/ROADMAP_ACCOUNTS,
решение 9): один аккаунт работает в нескольких студиях, и подпись в каждой своя.
Поэтому любой студийный экран (журнал, отчёты, зарплаты, список команды) обязан
брать имя вместе со `studio_id`, иначе покажет чужую подпись.

`users.name` тут не участвует намеренно: это личное имя аккаунта, оно живёт в
профиле и в переключателе аккаунтов.
"""
from collections.abc import Iterable
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Service, Studio, StudioMember, user_services
from services.i18n import resolve
# Палитра цветов сотрудников и цвета блоков журнала, которые мастеру носить
# нельзя, — services/staff_colors.py (там же — почему). STAFF_PALETTE отсюда
# импортируют онбординг и ассистент.
from services.staff_colors import STAFF_PALETTE, reserved_color  # noqa: F401


def full_name(member: StudioMember) -> str:
    """«Имя Фамилия» одной строкой — как показываем сотрудника в интерфейсе."""
    return " ".join(filter(None, (member.name, member.last_name)))


def is_specialist_clause(studio_id: int):
    """Предикат «этот член студии — мастер»: для WHERE и для колонки SELECT.

    Мастер = роль доступа «Тренер», ЛИБО владелец, которому назначены услуги
    этой студии. Владельца-мастера не делает ни вторая роль, ни второе членство:
    он остаётся владельцем, а мастером его делает назначенная услуга — ровно то
    действие, которым он правит себя в «Сотрудниках». Владелец без услуг
    мастером не становится, поэтому обычная студия ничего не замечает.
    Администратор мастером не становится вовсе: услуг ему не назначают.

    Правило ОДНО на весь продукт: список команды (колонка журнала), каталог
    ассистента, проверка «кому можно поставить занятие» и Resource-доступность
    витрины. Копии разошлись бы на первой правке — витрина предлагала бы
    мастера, которому журнал занятие поставить уже не даёт.
    """
    has_service = (
        select(user_services.c.user_id)
        .join(Service, Service.id == user_services.c.service_id)
        .where(
            user_services.c.user_id == StudioMember.user_id,
            Service.studio_id == studio_id,
        )
        .correlate(StudioMember)
        .exists()
    )
    return or_(
        StudioMember.role == "trainer",
        and_(StudioMember.role == "owner", has_service),
    )


async def is_specialist(db: AsyncSession, studio_id: int, user_id: int) -> bool:
    """Тот же вопрос про ОДНОГО человека — когда предикат некуда встроить.
    Не член студии → False."""
    return bool((await db.execute(
        select(is_specialist_clause(studio_id))
        .select_from(StudioMember)
        .where(StudioMember.studio_id == studio_id, StudioMember.user_id == user_id)
    )).scalars().first())


async def member_name(db: AsyncSession, studio_id: int, user_id: int) -> str:
    """Подпись ОДНОГО человека в этой студии — кто совершил действие в журнале
    активности и в уведомлениях. Не член студии → пустая строка."""
    return (await member_names(db, studio_id, [user_id])).get(user_id, "")


async def member_names(
    db: AsyncSession, studio_id: int, user_ids: Iterable[int]
) -> dict[int, str]:
    """{user_id: «Имя Фамилия»} для сотрудников этой студии — одним запросом.

    Отсутствие ключа значит, что человек в студии не состоит (уволен, а занятия
    остались): вызывающий сам решает, чем подписать такую строку.
    """
    ids = set(user_ids)
    if not ids:
        return {}
    rows = (await db.execute(
        select(StudioMember.user_id, StudioMember.name, StudioMember.last_name)
        .where(StudioMember.studio_id == studio_id, StudioMember.user_id.in_(ids))
    )).all()
    return {uid: " ".join(filter(None, (name, last_name))) for uid, name, last_name in rows}


# Кто получает свободный цвет первым, когда раздаём сразу нескольким: мастерам
# различаться в журнале важнее всего, администратор там колонки не имеет.
_COLOR_ROLE_ORDER = {"trainer": 0, "owner": 1}


def _color_counts(colors: Iterable[Optional[str]]) -> dict[str, int]:
    counts = {c.upper(): 0 for c in STAFF_PALETTE}
    for color in colors:
        if color and color.upper() in counts:
            counts[color.upper()] += 1
    return counts


def _rarest(counts: dict[str, int]) -> str:
    """Первый цвет палитры, которого ни у кого нет. Палитра кончилась — самый
    редкий, при равенстве тот, что раньше в палитре: повторы тогда расходятся
    по всей палитре, а не копятся на первом цвете."""
    return min(STAFF_PALETTE, key=lambda c: counts[c.upper()])


async def pick_member_color(db: AsyncSession, studio_id: int) -> str:
    """Цвет для нового участника студии — свободный из палитры (см. _rarest)."""
    used = (await db.execute(
        select(StudioMember.color).where(
            StudioMember.studio_id == studio_id, StudioMember.color.is_not(None))
    )).scalars().all()
    return _rarest(_color_counts(used))


def fill_missing_colors(members: Iterable[StudioMember]) -> bool:
    """Выдать цвет тем участникам студии, у кого его нет или у кого цвет блока
    журнала (перерыв, выходной, время студии — `staff_colors.reserved_color`).
    True — кому-то выдали.

    Передавать нужно ВСЮ команду студии: занятые цвета считаются по ней, и
    иначе новый цвет совпал бы с чужим. Раздаются по одному, с учётом только что
    выданных, — поэтому несколько «бесцветных» разом тоже получают разные цвета.
    Пустым цвет остаётся у строк, заведённых в обход роутеров (сиды, ручные
    вставки в базу), — чинится при первом же чтении команды, без миграции.
    Запретный — у тех, кто носил его до того, как цвет отдали блоку: их чинит
    ещё и запуск сервера (`repair_member_colors`).
    """
    members = list(members)
    counts = _color_counts(m.color for m in members)
    missing = sorted(
        (m for m in members if not m.color or reserved_color(m.color)),
        key=lambda m: (_COLOR_ROLE_ORDER.get(m.role, 2), m.id),
    )
    for member in missing:
        member.color = _rarest(counts)
        counts[member.color.upper()] += 1
    return bool(missing)


async def repair_member_colors(session_maker) -> int:
    """При запуске сервера: сменить цвет всем, кто ходит в цвете блока журнала.

    Один проход по всем студиям, где такой мастер есть; новый цвет — свободный
    в ЕГО студии (`fill_missing_colors` по всей её команде). Возвращает, скольким
    сменили. Повторный запуск ничего не трогает.
    """
    async with session_maker() as db:
        rows = (await db.execute(
            select(StudioMember.studio_id, StudioMember.color).where(StudioMember.color.is_not(None))
        )).all()
        studios = sorted({sid for sid, color in rows if reserved_color(color)})
        changed = 0
        for studio_id in studios:
            team = (await db.execute(
                select(StudioMember).where(StudioMember.studio_id == studio_id)
            )).scalars().all()
            before = {m.id: m.color for m in team}
            fill_missing_colors(team)
            changed += sum(1 for m in team if before[m.id] != m.color)
        if changed:
            await db.commit()
        return changed


async def user_lang(db: AsyncSession, user) -> str:
    """Язык, на котором писать этому человеку: личный, а если не выбран — язык
    его студии (`User.language` = NULL значит «как в студии», см. models/user.py).

    Нужен письмам, которые уходят человеку, а не студии: код подтверждения,
    готовый архив данных. Там на входе только User, и без этого запроса чешский
    владелец получал бы русское письмо.
    """
    if user.language:
        return resolve(user.language)
    lang = (await db.execute(
        select(Studio.language)
        .join(StudioMember, StudioMember.studio_id == Studio.id)
        .where(StudioMember.user_id == user.id, StudioMember.status == "active")
        .limit(1)
    )).scalars().first()
    return resolve(lang)
