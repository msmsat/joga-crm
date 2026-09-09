"""Предложить действие и исполнить согласие (P3).

    подбор -> ПРЕДЛОЖЕНИЕ (ничего не меняет)
           -> согласие человека
           -> ПОДТВЕРЖДЕНИЕ: право заново, условия заново, переход
           -> терминальное состояние предложения

ДВЕ РАЗНЫЕ ВЕЩИ, КОТОРЫЕ НЕЛЬЗЯ ПУТАТЬ:
  * `pending` предложение — сервер что-то предложил. В бизнесе не изменилось
    ничего: места не заняты, занятия не списаны, платежей нет;
  * `active` бронь — состоялось.

ПОДТВЕРЖДЕНИЕ ИДЁТ ОДНОЙ ТРАНЗАКЦИЕЙ И БЕЗ СЕТИ:

    BEGIN
      SELECT предложение FOR UPDATE      — второй «да» ждёт первого
      живо ли, не протухло ли, наш ли разговор
      ПРАВО — из базы, сейчас           — отзыв между показом и «да» работает
      ПЕРЕХОД (services/booking)        — с полной перепроверкой условий
      предложение -> терминальное
    COMMIT

Терминальное состояние ставится ПОСЛЕДНИМ и той же транзакцией: упади процесс
раньше — предложение останется живым и человек повторит; упади позже — уже
ничего не случится, потому что всё уже записано.
"""
from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional, Sequence

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import ActionProposal
from services import booking, identity
from services.booking import Outcome, Terms
from services.schedule_guard import lock_studio

logger = logging.getLogger(__name__)

# Сколько живёт предложение. Короче срока ссылок на варианты (60 минут) и
# намеренно: согласие «да» относится к конкретному занятию с конкретными
# местами, и через полчаса картина зала уже другая. Протухшее предложение — не
# ошибка, а приглашение переспросить.
TTL_MINUTES = 30

_TOKEN_BYTES = 24


class Kind(str, Enum):
    BOOK = "book"
    CANCEL = "cancel"
    RESCHEDULE = "reschedule"


class Status(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"
    SUPERSEDED = "superseded"


class ConfirmOutcome(str, Enum):
    """Чем кончилось согласие. Отдельно от исхода домена: «предложения нет» и
    «мест нет» — разные новости для человека."""
    DONE = "DONE"
    UNKNOWN = "UNKNOWN"                    # нет такого предложения / чужое
    EXPIRED = "EXPIRED"
    ALREADY_RESOLVED = "ALREADY_RESOLVED"
    AMBIGUOUS = "AMBIGUOUS"                # «да» при двух живых предложениях
    AUTH_REQUIRED = "AUTH_REQUIRED"
    REJECTED = "REJECTED"                  # домен отказал, причина в `outcome`


@dataclass(frozen=True)
class Offer:
    token: str
    proposal_id: int
    terms: Terms


@dataclass(frozen=True)
class Confirmed:
    outcome: ConfirmOutcome
    # Исход домена (services/booking.Outcome) — только при REJECTED.
    reason: Optional[Outcome] = None
    reservation_id: Optional[int] = None
    status: Optional[str] = None
    terms: Optional[Terms] = None
    # Карточка, которой досталась бронь. Берётся из ПРАВА, а не из предложения:
    # оплату дальше заводят на неё, и подставить сюда чужую нельзя.
    client_id: Optional[int] = None


def _now() -> datetime:
    return datetime.utcnow()


def _naive(moment: Optional[datetime]) -> datetime:
    """Момент к виду, в котором его хранит БД: наивный UTC.

    Колонки времени в проекте без зоны, и класть в них значение с зоной
    asyncpg отказывается прямо на вставке. Приводим ОДИН раз на входе, а не в
    каждом сравнении: забытое приведение здесь — падение на живом сообщении.
    """
    if moment is None:
        return _now()
    return (moment.astimezone(timezone.utc).replace(tzinfo=None)
            if moment.tzinfo else moment)


async def offer_booking(db: AsyncSession, *, studio_id: int, thread_id: int,
                        identity_id: Optional[int], client_id: int, lesson_id: int,
                        terms: Terms, now: Optional[datetime] = None) -> Offer:
    """Предложить запись. НЕ КОММИТИТ и ничего в бизнесе не меняет.

    Прежние живые предложения этого разговора ОТМЕНЯЮТСЯ: человек, которому
    показали новое занятие, соглашается на него, а не на позапрошлое. Иначе
    слово «да» становится двусмысленным ровно тогда, когда цена ошибки — чужая
    бронь.
    """
    moment = _naive(now)
    await supersede(db, studio_id=studio_id, thread_id=thread_id)
    row = ActionProposal(
        studio_id=studio_id, thread_id=thread_id, identity_id=identity_id,
        client_id=client_id, token=secrets.token_urlsafe(_TOKEN_BYTES),
        kind=Kind.BOOK.value, lesson_id=lesson_id, terms=terms.to_json(),
        status=Status.PENDING.value, created_at=moment,
        expires_at=moment + timedelta(minutes=TTL_MINUTES),
    )
    db.add(row)
    await db.flush()
    logger.info("proposal_created studio_id=%s thread_id=%s kind=%s lesson_id=%s",
                studio_id, thread_id, Kind.BOOK.value, lesson_id)
    return Offer(row.token, row.id, terms)


async def supersede(db: AsyncSession, *, studio_id: int, thread_id: int) -> int:
    """Отменить живые предложения разговора. Не коммитит."""
    rows = (await db.execute(
        update(ActionProposal)
        .where(ActionProposal.studio_id == studio_id,
               ActionProposal.thread_id == thread_id,
               ActionProposal.status == Status.PENDING.value)
        .values(status=Status.SUPERSEDED.value, resolved_at=_now())
        .returning(ActionProposal.id)
    )).scalars().all()
    if rows:
        logger.info("proposal_superseded studio_id=%s thread_id=%s count=%s",
                    studio_id, thread_id, len(rows))
    return len(rows)


async def live(db: AsyncSession, *, studio_id: int, thread_id: int,
               now: Optional[datetime] = None) -> list[ActionProposal]:
    """Живые предложения разговора — те, на которые «да» ещё что-то значит."""
    moment = _naive(now)
    return list((await db.execute(
        select(ActionProposal).where(
            ActionProposal.studio_id == studio_id,
            ActionProposal.thread_id == thread_id,
            ActionProposal.status == Status.PENDING.value,
            ActionProposal.expires_at > moment,
        ).order_by(ActionProposal.id)
    )).scalars().all())


async def confirm_by_token(db: AsyncSession, *, studio_id: int, thread_id: int,
                           token: str, now: Optional[datetime] = None,
                           allow_hold: bool = False) -> Confirmed:
    """Нажатая кнопка «Записаться». Модель на этом пути не участвует."""
    await lock_studio(db, studio_id)
    row = (await db.execute(
        select(ActionProposal).where(
            ActionProposal.token == token,
            ActionProposal.studio_id == studio_id,
            ActionProposal.thread_id == thread_id,
        ).with_for_update().execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if row is None:
        # Чужая студия, чужой разговор, выдуманный токен — снаружи одно и то же.
        return Confirmed(ConfirmOutcome.UNKNOWN)
    return await _execute(db, row, now=now, allow_hold=allow_hold)


async def confirm_only_live(db: AsyncSession, *, studio_id: int, thread_id: int,
                            now: Optional[datetime] = None,
                            allow_hold: bool = False) -> Confirmed:
    """Согласие СЛОВОМ («да», «давай»). Работает, только если предложение одно.

    Двух живых предложений быть не должно (`offer_booking` гасит прежние), но
    если они как-то оказались, угадывать нельзя: «да» относится к одному из
    них, и ошибиться значит записать человека не на то занятие.
    """
    await lock_studio(db, studio_id)
    rows = await live(db, studio_id=studio_id, thread_id=thread_id, now=now)
    if not rows:
        return Confirmed(ConfirmOutcome.UNKNOWN)
    if len(rows) > 1:
        logger.info("proposal_ambiguous studio_id=%s thread_id=%s count=%s",
                    studio_id, thread_id, len(rows))
        return Confirmed(ConfirmOutcome.AMBIGUOUS)
    # `populate_existing` ОБЯЗАТЕЛЕН вместе с блокировкой. Строка уже загружена
    # в эту же сессию запросом `live()` выше, и без него ORM вернёт объект из
    # своей карты со СТАРЫМ статусом: строка блокируется, а решение
    # принимается по устаревшему значению — два одновременных «да» оба видят
    # предложение живым и оба заводят бронь. Тот же капкан и по той же причине,
    # что в `stripe_pay.apply_paid`.
    locked = (await db.execute(
        select(ActionProposal).where(ActionProposal.id == rows[0].id)
        .with_for_update().execution_options(populate_existing=True)
    )).scalar_one()
    return await _execute(db, locked, now=now, allow_hold=allow_hold)


async def _execute(db: AsyncSession, row: ActionProposal, *,
                   now: Optional[datetime], allow_hold: bool = False) -> Confirmed:
    """Общий путь подтверждения. Строка уже заблокирована вызывающим.

    `allow_hold` — можно ли держать место под оплату картой. Решает вызывающий
    (агент смотрит на флаг раскатки `AGENT_PAYMENTS`), потому что решение это
    про раскатку, а не про бизнес-правило: без него платное занятие честно
    отвечает «нужна оплата», а не заводит бронь, которую нечем оплатить.
    """
    moment = _naive(now)
    if row.status != Status.PENDING.value:
        # Второй «да» на то же предложение. Не переигрываем: повторное нажатие
        # не должно завести вторую бронь.
        # Второй «да» на то же предложение. Возвращаем СВОЮ бронь: ход выше
        # переиздаёт по ней ссылку на оплату, если та ещё держится, — иначе
        # оборванная оплата не имела бы способа возобновиться.
        return Confirmed(ConfirmOutcome.ALREADY_RESOLVED,
                         reservation_id=row.created_reservation_id,
                         client_id=row.client_id)
    if row.expires_at <= moment:
        row.status = Status.EXPIRED.value
        row.resolved_at = moment
        logger.info("proposal_stale studio_id=%s proposal_id=%s reason=expired",
                    row.studio_id, row.id)
        return Confirmed(ConfirmOutcome.EXPIRED)

    # ПРАВО — ИЗ БАЗЫ И СЕЙЧАС. Предложение создавалось для подтверждённого
    # человека; за минуту сотрудник мог отозвать связь, и согласие само по себе
    # прав не даёт.
    allowed = await identity.require(
        db, studio_id=row.studio_id, identity_id=row.identity_id,
        capability=identity.Capability.BOOK_WITH_CREDIT)
    if allowed.decision is not identity.Decision.OK:
        row.status = Status.FAILED.value
        row.outcome = allowed.decision.value[:32]
        row.resolved_at = moment
        logger.info("proposal_denied studio_id=%s proposal_id=%s decision=%s",
                    row.studio_id, row.id, allowed.decision.value)
        return Confirmed(ConfirmOutcome.AUTH_REQUIRED)
    # Карточка берётся из ПРАВА, а не из предложения: за время ожидания связь
    # могли перепривязать, и запись обязана достаться тому, кто подтверждён.
    client_id = allowed.client_id

    shown = Terms.from_json(row.terms)
    result = await booking.create(
        db, studio_id=row.studio_id, client_id=client_id,
        lesson_id=row.lesson_id, source="agent", shown=shown, now=now,
        hold_for_payment=allow_hold)
    row.resolved_at = moment
    if result.outcome is not Outcome.OK:
        row.status = Status.FAILED.value
        row.outcome = result.outcome.value[:32]
        logger.info("proposal_failed studio_id=%s proposal_id=%s outcome=%s",
                    row.studio_id, row.id, result.outcome.value)
        return Confirmed(ConfirmOutcome.REJECTED, reason=result.outcome,
                         terms=result.terms)
    row.status = Status.COMPLETED.value
    row.created_reservation_id = result.reservation_id
    logger.info("proposal_confirmed studio_id=%s proposal_id=%s reservation_id=%s",
                row.studio_id, row.id, result.reservation_id)
    return Confirmed(ConfirmOutcome.DONE, reservation_id=result.reservation_id,
                     status=result.status, terms=result.terms, client_id=client_id)


async def purge(db: AsyncSession, *, now: Optional[datetime] = None) -> int:
    """Пометить протухшие предложения. Работает НЕЗАВИСИМО от флага: живое
    предложение, которое некому закрыть, висит вечно."""
    moment = _naive(now)
    rows = (await db.execute(
        update(ActionProposal)
        .where(ActionProposal.status == Status.PENDING.value,
               ActionProposal.expires_at <= moment)
        .values(status=Status.EXPIRED.value, resolved_at=moment)
        .returning(ActionProposal.id)
    )).scalars().all()
    return len(rows)


async def forget(db: AsyncSession, *, studio_id: int,
                 client_id: Optional[int] = None) -> int:
    """Удалить предложения — по клиенту либо по студии (хранение, GDPR).

    Брони и платежи не трогаются: они существуют по своим основаниям.
    """
    query = select(ActionProposal).where(ActionProposal.studio_id == studio_id)
    if client_id is not None:
        query = query.where(ActionProposal.client_id == client_id)
    rows = (await db.execute(query)).scalars().all()
    for row in rows:
        await db.delete(row)
    return len(rows)
