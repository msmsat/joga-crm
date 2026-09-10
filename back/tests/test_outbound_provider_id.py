"""Длинный id провайдера не должен запирать переписку (инцидент 10.09.2026).

ЧТО СЛУЧИЛОСЬ В БОЮ. Instagram вернул mid длиной 164 символа, колонка была
VARCHAR(128), и запись УСПЕШНОГО исхода упала уже ПОСЛЕ отправки. Ответ клиент
получил, но строка осталась в `sending`, а `sending` в треде блокирует все
следующие сообщения этого разговора (services/outbound._blocked). Итог: человек
написал три раза, получил один ответ, и в журнале не было ни `failed`, ни
`retry` — работа считалась выполненной.

Поэтому проверяется не «влезает ли строка», а СЛЕДСТВИЕ: после доставки тред
свободен и следующий ответ уходит. Тест на ширину колонки этого бы не поймал —
он зелен и на застрявшем `sending`.

Тестовая БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_outbound_provider_id.py
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

import pytest
from sqlalchemy import delete, select

from database import async_session_maker
from models import ChannelThread, OutboundMessage, Studio
from services import channels, outbound

_NAME = "TEST-PROVIDER-ID"
# Ровно та длина, на которой падал бой: mid Instagram из журнала воркера.
_LONG_ID = "m" * 164


class _Provider:
    """Транспорт, который принял сообщение и вернул длинный идентификатор."""

    def __init__(self, provider_message_id: str):
        self.provider_message_id = provider_message_id
        self.sent: list = []
        self._saved = {}

    def install(self):
        from services.channels import instagram, telegram, whatsapp

        for module in (telegram, instagram, whatsapp):
            self._saved[module] = module.send

            async def _fake(transport, recipient, payload, _m=module):
                self.sent.append(payload["text"])
                return channels.SendResult(
                    channels.ACCEPTED, provider_message_id=self.provider_message_id)
            module.send = _fake
        return self

    def restore(self):
        for module, original in self._saved.items():
            module.send = original


async def _seed() -> tuple[int, int]:
    async with async_session_maker() as db:
        studio = Studio(name=_NAME)
        db.add(studio)
        await db.commit()
        thread = ChannelThread(studio_id=studio.id, channel="instagram", sender_ref="igsid-1")
        db.add(thread)
        await db.commit()
        return studio.id, thread.id


async def _cleanup(studio_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(OutboundMessage).where(OutboundMessage.studio_id == studio_id))
        await db.execute(delete(ChannelThread).where(ChannelThread.studio_id == studio_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.commit()


async def _queue(studio_id: int, thread_id: int, key: str, text: str) -> int:
    async with async_session_maker() as db:
        row_id = await outbound.enqueue(
            db, studio_id=studio_id, thread_id=thread_id, dedup_key=key,
            payload={"text": text},
        )
        await db.commit()
        return row_id


async def _send_next(ids: list[int]) -> tuple[str | None, int | None]:
    """Взять и отправить следующее доступное сообщение. None — очередь заперта."""
    async with async_session_maker() as db:
        claimed = await outbound.claim_next(db, "w-test", ids=ids)
    if claimed is None:
        return None, None
    return await outbound.deliver(claimed, "transport"), claimed.id


async def _status(row_id: int) -> tuple[str, str | None]:
    async with async_session_maker() as db:
        row = (await db.execute(select(OutboundMessage).where(
            OutboundMessage.id == row_id))).scalar_one()
        return row.status, row.provider_message_id


@pytest.fixture()
def seeded():
    studio_id, thread_id = asyncio.run(_seed())
    provider = _Provider(_LONG_ID).install()
    try:
        yield studio_id, thread_id
    finally:
        provider.restore()
        asyncio.run(_cleanup(studio_id))


def test_long_provider_id_does_not_jam_the_conversation(seeded):
    """Ответ доставлен, исход записан, следующее сообщение треда уходит.

    Провал = ровно бой: первый ответ ушёл, а второй и третий не уйдут никогда,
    потому что тред заперт застрявшим `sending`.
    """
    studio_id, thread_id = seeded
    first = asyncio.run(_queue(studio_id, thread_id, f"{_NAME}:1", "Привет!"))
    second = asyncio.run(_queue(studio_id, thread_id, f"{_NAME}:2", "Записываю на завтра."))

    outcome, sent_id = asyncio.run(_send_next([first, second]))
    assert (outcome, sent_id) == (outbound.ACCEPTED, first), "первый ответ не доставлен"

    status, stored = asyncio.run(_status(first))
    assert status == outbound.ACCEPTED, f"строка застряла в {status!r} — тред заперт"
    # Идентификатор сохранён и не потерян: он единственная ниточка к статусам.
    assert stored == _LONG_ID

    # ГЛАВНОЕ: разговор продолжается.
    outcome, sent_id = asyncio.run(_send_next([first, second]))
    assert (outcome, sent_id) == (outbound.ACCEPTED, second), \
        "следующий ответ не ушёл — разговор заперт предыдущим"


def test_absurdly_long_id_is_trimmed_rather_than_crashing(seeded):
    """Даже сверх ширины колонки — обрезаем, а не роняем запись исхода.

    Усечённый идентификатор ухудшает сверку статусов доставки; исключение здесь
    останавливает переписку целиком. Второе несопоставимо хуже первого.
    """
    studio_id, thread_id = seeded
    from services.channels import instagram

    async def _huge(transport, recipient, payload):
        return channels.SendResult(channels.ACCEPTED, provider_message_id="x" * 4000)

    instagram.send = _huge
    row_id = asyncio.run(_queue(studio_id, thread_id, f"{_NAME}:huge", "Ответ"))

    outcome, _ = asyncio.run(_send_next([row_id]))

    assert outcome == outbound.ACCEPTED
    status, stored = asyncio.run(_status(row_id))
    assert status == outbound.ACCEPTED
    assert len(stored) == outbound._PROVIDER_ID_LEN
