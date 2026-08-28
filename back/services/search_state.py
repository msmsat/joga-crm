"""Состояние поиска в разговоре и непрозрачные ссылки на показанные варианты (P1.5).

ЗАЧЕМ. P1.4 честно оставил дыру: многоходовость держалась на том, что модель
видит переписку и каждый раз возвращает намерение целиком. Это ненадёжно в обе
стороны — модель может ЗАБЫТЬ условие («стретчинг у Валерии» → «а после 18?» →
внезапно всё расписание) и может ДОБАВИТЬ условие, которого человек в этом
поиске не называл. Ни то ни другое не должно зависеть от памяти модели.

Поэтому условия разговора хранит сервер, и хранит он РАЗРЕШЁННОЕ:
идентификаторы, календарные границы, часы — то, что сервер уже признал сам.
Ответ модели сюда не попадает: он лишь изменение, которое сервер применяет.

    прежнее состояние  +  дельта модели  =  новое состояние
                          (только то, о чём человек сказал СЕЙЧАС)

НЕПРОЗРАЧНЫЕ ССЫЛКИ. Человеку нужно уметь сказать «второй», а модели нельзя
знать `lesson_id` — иначе весь P1.4 напрасен. Поэтому каждый показанный вариант
получает случайный токен, привязанный к студии, треду и ВЕРСИИ поиска.
Соседний токен по нему не угадывается, в чужом треде он не работает, а новый
поиск делает старые ссылки недействительными: «второй» из позапрошлого списка
не должен означать второй из нынешнего.

СОГЛАСОВАННОСТЬ С ОТПРАВКОЙ. Ссылки записываются ТОЙ ЖЕ транзакцией, что и
исходящее сообщение (services/agent_jobs). Упасть до неё — не останется ни
ссылок, ни ответа; упасть после — есть и то и другое. Состояния «сервер считает
варианты показанными, а человек их не получил» не существует.
"""
from __future__ import annotations

import secrets
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Optional, Sequence

from sqlalchemy import delete, select, update

from models import ChannelThread, ThreadOption

# Сколько живут ссылки на показанные варианты и само состояние поиска.
#
# Час выбран не на глаз: правила записи по умолчанию закрывают запись за 120
# минут до начала (`BookingRules.min_booking_advance_min`), поэтому вариант,
# показанный час назад, ещё не мог выпасть из окна, в котором он предлагался.
# Дальше расписание и места успевают измениться настолько, что честнее искать
# заново, чем оживлять старый список.
TTL_MINUTES = 60

# Сколько вариантов помещается в один ответ. Больше человек в мессенджере не
# читает, а «показать ещё» листает тот же детерминированный порядок.
PAGE_SIZE = 5

# 32 символа из secrets.token_urlsafe — 24 случайных байта. Угадывать нечего, и
# порядковой связи между соседними ссылками нет (см. §26 задания).
_TOKEN_BYTES = 24


@dataclass(frozen=True)
class CanonicalState:
    """Условия разговора — уже РАЗРЕШЁННЫЕ сервером, не слова модели.

    Всё здесь либо идентификатор, найденный в каталоге этой студии, либо дата,
    посчитанная по её календарю. Поэтому состояние можно применять повторно, не
    спрашивая модель, и нельзя подменить, подсунув другое сообщение.
    """
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    time_from: Optional[time] = None
    time_to: Optional[time] = None
    service_ids: tuple[int, ...] = ()
    trainer_ids: tuple[int, ...] = ()
    branch_ids: tuple[int, ...] = ()
    # Те же сущности, но пожеланиями: сервер вправе их снять, если без них
    # ничего не нашлось. Обязательные не снимаются никогда.
    preferred_service_ids: tuple[int, ...] = ()
    preferred_trainer_ids: tuple[int, ...] = ()
    preferred_trainer_names: tuple[str, ...] = ()
    only_with_free_spots: bool = False
    only_bookable: bool = False
    page: int = 0

    def to_json(self) -> dict:
        out = asdict(self)
        for key in ("date_from", "date_to", "time_from", "time_to"):
            out[key] = out[key].isoformat() if out[key] is not None else None
        for key, value in list(out.items()):
            if isinstance(value, tuple):
                out[key] = list(value)
        return out

    @staticmethod
    def from_json(raw: Optional[dict]) -> Optional["CanonicalState"]:
        if not raw:
            return None
        try:
            return CanonicalState(
                date_from=date.fromisoformat(raw["date_from"]) if raw.get("date_from") else None,
                date_to=date.fromisoformat(raw["date_to"]) if raw.get("date_to") else None,
                time_from=time.fromisoformat(raw["time_from"]) if raw.get("time_from") else None,
                time_to=time.fromisoformat(raw["time_to"]) if raw.get("time_to") else None,
                service_ids=tuple(raw.get("service_ids") or ()),
                trainer_ids=tuple(raw.get("trainer_ids") or ()),
                branch_ids=tuple(raw.get("branch_ids") or ()),
                preferred_service_ids=tuple(raw.get("preferred_service_ids") or ()),
                preferred_trainer_ids=tuple(raw.get("preferred_trainer_ids") or ()),
                preferred_trainer_names=tuple(raw.get("preferred_trainer_names") or ()),
                only_with_free_spots=bool(raw.get("only_with_free_spots")),
                only_bookable=bool(raw.get("only_bookable")),
                page=int(raw.get("page") or 0),
            )
        except (KeyError, TypeError, ValueError):
            # Состояние написано другой версией кода и разобрано быть не может.
            # Забыть его безопасно: человек переспросит, а угадывать условия
            # разговора по обломкам нельзя.
            return None


@dataclass(frozen=True)
class Loaded:
    """Что помнит разговор. `state is None` — помнить нечего или срок вышел."""
    version: int
    state: Optional[CanonicalState]
    stale: bool = False


async def load(db, thread_id: int, *, now: datetime) -> Loaded:
    """Условия прошлого поиска. Просроченные не возвращаются: «а второй?» через
    сутки обязано означать «поищите заново», а не выбор из вчерашнего списка."""
    row = (await db.execute(
        select(ChannelThread.search_version, ChannelThread.search_state,
               ChannelThread.search_state_at)
        .where(ChannelThread.id == thread_id)
    )).first()
    if row is None:
        return Loaded(0, None)
    version, raw, at = row
    version = version or 0
    if raw is None or at is None:
        return Loaded(version, None)
    if now - at > timedelta(minutes=TTL_MINUTES):
        return Loaded(version, None, stale=True)
    return Loaded(version, CanonicalState.from_json(raw))


def new_tokens(count: int) -> list[str]:
    """Случайные ссылки на варианты. Криптостойкий генератор, без порядка."""
    return [secrets.token_urlsafe(_TOKEN_BYTES) for _ in range(count)]


async def commit(db, *, studio_id: int, thread_id: int, state: CanonicalState,
                 shown: Sequence[tuple[str, int]], now: datetime,
                 new_search: bool) -> int:
    """Записать условия разговора и показанные варианты. БЕЗ коммита.

    Зовётся внутри финальной транзакции хода агента — той же, что кладёт
    исходящее сообщение. Порознь они дали бы ровно то, чего быть не должно:
    список вариантов, который человеку никогда не отправили.

    `new_search` увеличивает версию: старые ссылки после этого недействительны,
    и «второй» из прошлого списка не выберет вариант из нового.
    """
    row = (await db.execute(
        select(ChannelThread.search_version).where(ChannelThread.id == thread_id)
    )).scalar_one_or_none()
    version = (row or 0) + (1 if new_search else 0)

    await db.execute(
        update(ChannelThread)
        .where(ChannelThread.id == thread_id)
        .values(search_version=version, search_state=state.to_json(), search_state_at=now)
    )
    if shown:
        expires = now + timedelta(minutes=TTL_MINUTES)
        db.add_all([
            ThreadOption(studio_id=studio_id, thread_id=thread_id, token=token,
                         search_version=version, ordinal=index, lesson_id=lesson_id,
                         created_at=now, expires_at=expires)
            for index, (token, lesson_id) in enumerate(shown, start=1)
        ])
    return version


@dataclass(frozen=True)
class Pick:
    """Чем закончился выбор варианта."""
    lesson_id: Optional[int] = None
    ordinal: Optional[int] = None
    reason: Optional[str] = None      # expired · superseded · unknown · none_shown


async def by_token(db, *, studio_id: int, thread_id: int, token: str,
                   now: datetime) -> Pick:
    """Вариант по нажатой кнопке. Чужой студии и чужого треда для нас не
    существует — и это условие в самом запросе, а не проверка после."""
    row = (await db.execute(
        select(ThreadOption).where(
            ThreadOption.token == token,
            ThreadOption.studio_id == studio_id,
            ThreadOption.thread_id == thread_id,
        )
    )).scalar_one_or_none()
    if row is None:
        return Pick(reason="unknown")
    if row.expires_at <= now:
        return Pick(reason="expired")
    version = (await db.execute(
        select(ChannelThread.search_version).where(ChannelThread.id == thread_id)
    )).scalar_one_or_none() or 0
    if row.search_version != version:
        # Список успел смениться: «этот» указывает на позицию, которой человек
        # уже не видит. Молча подставить занятие из нового списка нельзя.
        return Pick(reason="superseded")
    return Pick(lesson_id=row.lesson_id, ordinal=row.ordinal)


async def by_ordinal(db, *, studio_id: int, thread_id: int, ordinal: int,
                     now: datetime) -> Pick:
    """«Второй» — из ПОСЛЕДНЕГО показанного списка, а не из нового поиска."""
    version = (await db.execute(
        select(ChannelThread.search_version).where(ChannelThread.id == thread_id)
    )).scalar_one_or_none() or 0
    if not version:
        return Pick(reason="none_shown")
    rows = (await db.execute(
        select(ThreadOption)
        .where(ThreadOption.thread_id == thread_id, ThreadOption.studio_id == studio_id,
               ThreadOption.search_version == version)
        .order_by(ThreadOption.ordinal)
    )).scalars().all()
    if not rows:
        return Pick(reason="none_shown")
    if rows[0].expires_at <= now:
        return Pick(reason="expired")
    found = next((r for r in rows if r.ordinal == ordinal), None)
    if found is None:
        # Человек назвал восьмой, когда показали три. Не угадываем и не берём
        # последний: он не это имел в виду.
        return Pick(reason="unknown")
    return Pick(lesson_id=found.lesson_id, ordinal=found.ordinal)


async def forget(db, *, studio_id: Optional[int] = None,
                 thread_ids: Optional[Sequence[int]] = None) -> None:
    """Забыть состояние разговоров и ссылки — по запросу на удаление данных.

    Брони и платежи это НЕ трогает: удаление переписки не отменяет визит и не
    возвращает деньги (см. §80 задания).
    """
    options = delete(ThreadOption)
    threads = update(ChannelThread).values(
        search_state=None, search_state_at=None, search_version=0)
    if thread_ids is not None:
        options = options.where(ThreadOption.thread_id.in_(list(thread_ids)))
        threads = threads.where(ChannelThread.id.in_(list(thread_ids)))
    elif studio_id is not None:
        options = options.where(ThreadOption.studio_id == studio_id)
        threads = threads.where(ChannelThread.studio_id == studio_id)
    else:
        raise ValueError("forget: нужен studio_id или thread_ids")
    await db.execute(options)
    await db.execute(threads)


async def purge(db, *, now: datetime) -> int:
    """Убрать просроченные ссылки. Состояние в треде обнуляем тем же заходом —
    иначе просроченные условия жили бы вечно в JSON."""
    result = await db.execute(
        delete(ThreadOption).where(ThreadOption.expires_at <= now))
    await db.execute(
        update(ChannelThread)
        .where(ChannelThread.search_state_at.is_not(None),
               ChannelThread.search_state_at < now - timedelta(minutes=TTL_MINUTES))
        .values(search_state=None, search_state_at=None)
    )
    return result.rowcount or 0


if __name__ == "__main__":
    state = CanonicalState(date_from=date(2027, 5, 13), date_to=date(2027, 5, 13),
                           time_from=time(18, 0), service_ids=(4,), trainer_ids=(9,))
    assert CanonicalState.from_json(state.to_json()) == state
    assert CanonicalState.from_json(None) is None
    assert CanonicalState.from_json({"date_from": "не дата"}) is None

    tokens = new_tokens(200)
    assert len(set(tokens)) == 200, "ссылки повторяются"
    assert all(len(t) >= 30 for t in tokens)
    # Соседние ссылки не связаны: общего начала у них нет.
    def _shared(a: str, b: str) -> int:
        n = 0
        while n < min(len(a), len(b)) and a[n] == b[n]:
            n += 1
        return n

    assert max(_shared(a, b) for a, b in zip(tokens, tokens[1:])) < 6
    print("search_state self-check ok")
