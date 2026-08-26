"""Открытая карточка — детерминированный контекст ссылок «её», «здесь», «этого».

Зачем это отдельный слой, а не строка от фронта. Приложение точно знает, чья
карточка открыта, а агент до сих пор получал только маршрут (`/dashboard/clients`
без идентификатора: параметр `?client=` фронт стирает из адреса сразу после
открытия панели). Поэтому «покажи её расписание» на карточке клиента модель
через раз резолвила в тренера — не потому что плохо думает, а потому что ей не
сказали.

Три правила, на которых это держится.

  * Клиент присылает ТИП и ЧИСЛОВОЙ id, а не имя. Имя пришло бы из браузера, и
    доверять ему нельзя ни как ключу (тёзки), ни как факту (подменят).
  * Название сущности читает сервер из своей базы. То, что попадёт в промпт,
    добыто здесь, а не принято на веру.
  * Сущность загружается ПОД ПРАВАМИ спрашивающего, теми же условиями, что
    список и карточка (`client_scope`). Тренер, приславший чужой client_id,
    получает ровно то же, что при прямом запросе, — ничего. Отказ молчаливый:
    «нет доступа» и «нет такого» обязаны выглядеть одинаково, иначе перебором
    id узнаётся состав чужой базы.

Ничего, кроме одной строки в слот [2] промпта, отсюда не выходит: контекст
подсказывает, о ком речь, но прав не выдаёт — каждый инструмент проверяет их
сам.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Client, Hall, Lesson, Reservation, StudioMember
from routers.clients._scope import client_scope

logger = logging.getLogger(__name__)

# Типы, которые приложение умеет открывать карточкой. Закрытый список: тип
# приходит снаружи и уходит в ветвление, а «а вдруг пригодится» здесь означает
# запрос в таблицу, которую роль видеть не должна.
ENTITY_TYPES = ("client", "staff", "lesson", "reservation", "hall")


async def _client(db: AsyncSession, ctx, entity_id: int) -> str | None:
    row = (await db.execute(
        select(Client).where(Client.id == entity_id, *client_scope(ctx))
    )).scalar_one_or_none()
    if row is None:
        return None
    name = " ".join(x for x in (row.name, row.last_name) if x) or "без имени"
    return f"клиент «{name}» (client_id={row.id})"


async def _staff(db: AsyncSession, ctx, entity_id: int) -> str | None:
    """Сотрудник — это StudioMember.user_id, тот же идентификатор, которым
    инструменты расписания называют тренера (Lesson.teacher_id)."""
    row = (await db.execute(
        select(StudioMember).where(
            StudioMember.user_id == entity_id,
            StudioMember.studio_id == ctx.studio_id,
        )
    )).scalar_one_or_none()
    if row is None:
        return None
    return f"сотрудник «{row.name or 'без имени'}» (teacher_id={row.user_id}, роль {row.role})"


async def _lesson(db: AsyncSession, ctx, entity_id: int) -> str | None:
    conds = [Lesson.id == entity_id, Lesson.studio_id == ctx.studio_id]
    if ctx.role == "trainer":
        # Тренер видит только свои занятия — то же сужение, что в журнале.
        conds.append(Lesson.teacher_id == ctx.user.id)
    row = (await db.execute(select(Lesson).where(*conds))).scalar_one_or_none()
    if row is None:
        return None
    when = row.start_time.strftime("%Y-%m-%d %H:%M") if row.start_time else "без времени"
    return (f"занятие «{row.name}» (lesson_id={row.id}, {when}, "
            f"тренер {row.teacher_name or '—'})")


async def _reservation(db: AsyncSession, ctx, entity_id: int) -> str | None:
    conds = [Reservation.id == entity_id, Lesson.studio_id == ctx.studio_id]
    if ctx.role == "trainer":
        conds.append(Lesson.teacher_id == ctx.user.id)
    row = (await db.execute(
        select(Reservation, Lesson)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(*conds)
    )).first()
    if row is None:
        return None
    res, lesson = row
    return (f"запись клиента (reservation_id={res.id}, client_id={res.client_id}) "
            f"на занятие «{lesson.name}» (lesson_id={lesson.id})")


async def _hall(db: AsyncSession, ctx, entity_id: int) -> str | None:
    row = (await db.execute(
        select(Hall).where(Hall.id == entity_id, Hall.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        return None
    return f"зал «{row.name}» (hall_id={row.id}, вместимость {row.capacity})"


_LOADERS = {
    "client": _client,
    "staff": _staff,
    "lesson": _lesson,
    "reservation": _reservation,
    "hall": _hall,
}


async def describe(db: AsyncSession, ctx, entity) -> str | None:
    """Строка про открытую карточку — или None, если открывать нечего.

    None и «нет доступа» здесь одно и то же значение намеренно (см. модуль).
    """
    if entity is None:
        return None
    kind = getattr(entity, "type", None)
    entity_id = getattr(entity, "id", None)
    loader = _LOADERS.get(kind)
    if loader is None or not isinstance(entity_id, int):
        return None
    try:
        return await loader(db, ctx, entity_id)
    except Exception:
        # Контекст — удобство, а не условие работы. Упавший запрос обязан
        # стоить подсказки, а не всего ответа человеку.
        logger.exception("ai_entity: не удалось описать %s#%s", kind, entity_id)
        return None
