"""Реквизиты канала и его транспорт обязаны подходить друг другу (P0.4).

ПОЧЕМУ ЭТОТ ФАЙЛ ЕСТЬ. Резолв реквизитов (`agent_jobs._transport`) и их
потребление (`services/channels/*.send`) до сих пор проверялись ПОРОЗНЬ:
test_inbound_events смотрит только на возвращённую строку, test_outbound
подставляет транспорт руками ("token") и до настоящего резолва не доходит.
Между двумя зелёными тестами помещался канал, у которого резолв отдавал пустую
строку, а транспорт на пустую строку отвечал «канал не подключён», — и ответ
клиенту молча становился failed. Ровно так прожил Instagram: `_transport`
возвращал "" по комментарию из эпохи, когда отправкой занимался
`client_agent._send`, а этой функции нет с P0.4.

Поэтому проверяется СТЫК: реквизиты достаются из БД тем же кодом, что и в бою,
и скармливаются настоящему `send()` канала. Сеть подменена — важно, что вызов
до неё дошёл и унёс боевой токен, а не то, что ответил провайдер.

Тестовая БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_transport_credentials.py
"""
import asyncio
import json
import warnings

warnings.filterwarnings("ignore")

import pytest
from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    BookingChannelConfig, Studio, StudioAISettings, StudioIntegration,
)
from services import agent_jobs, channels, inbound
from services.channels import instagram, telegram, whatsapp

_NAME = "TEST-TRANSPORT-CREDS"
_TG_TOKEN = "111:TEST-TRANSPORT-TG"
_WA_NUMBER = "1234567890"
_WA_TOKEN = "TEST-TRANSPORT-WA"
_IG_TOKEN = "TEST-TRANSPORT-IG"
_IG_ACCOUNT = "17841400000000000"

# Ответ провайдера, устраивающий все три транспорта сразу: каждый вычитывает
# из тела свой идентификатор сообщения.
_OK_BODY = {
    "ok": True,
    "result": {"message_id": 1},          # Telegram
    "messages": [{"id": "wamid.test"}],   # WhatsApp
    "message_id": "mid.test",             # Instagram
}


# ─── Подмена сети ────────────────────────────────────────────────────────────

class _Response:
    status = 200
    headers: dict = {}

    async def text(self):
        return json.dumps(_OK_BODY)

    async def json(self):
        return _OK_BODY

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False


class _Session:
    """Сессия aiohttp, которая никуда не ходит и записывает вызов."""

    def __init__(self, calls: list):
        self._calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    def post(self, url, **kwargs):
        self._calls.append((url, kwargs))
        return _Response()


def _capture(monkeypatch, module) -> list:
    calls: list = []
    monkeypatch.setattr(module.aiohttp, "ClientSession", lambda *a, **kw: _Session(calls))
    return calls


def _secrets(url: str, kwargs: dict) -> str:
    """Всё, чем канал представился провайдеру: у Telegram токен в адресе, у
    Meta — в заголовке."""
    return f"{url} {kwargs.get('headers') or {}}"


# ─── Данные ──────────────────────────────────────────────────────────────────

async def _seed() -> int:
    async with async_session_maker() as db:
        studio = Studio(name=_NAME)
        db.add(studio)
        await db.commit()
        db.add_all([
            StudioAISettings(studio_id=studio.id, ig_enabled=True, wa_enabled=True,
                             tg_enabled=True, ig_token=_IG_TOKEN, ig_user_id=_IG_ACCOUNT),
            StudioIntegration(studio_id=studio.id, integration_type="wa_notify",
                              is_connected=True,
                              config={"phone_number_id": _WA_NUMBER, "token": _WA_TOKEN}),
            StudioIntegration(studio_id=studio.id, integration_type="ig_dm",
                              is_connected=True,
                              config={"token": _IG_TOKEN, "ig_user_id": _IG_ACCOUNT,
                                      "username": "studio", "api": "instagram_login"}),
            BookingChannelConfig(studio_id=studio.id, channel_type="telegram",
                                 is_active=True, config={"token": _TG_TOKEN}),
        ])
        await db.commit()
        return studio.id


async def _cleanup(studio_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == studio_id))
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == studio_id))
        await db.execute(delete(BookingChannelConfig).where(BookingChannelConfig.studio_id == studio_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.commit()


async def _transport(studio_id: int, channel: str):
    async with async_session_maker() as db:
        return await agent_jobs._transport(db, studio_id, channel)


# ─── Тесты ───────────────────────────────────────────────────────────────────

@pytest.fixture()
def studio_id():
    sid = asyncio.run(_seed())
    try:
        yield sid
    finally:
        asyncio.run(_cleanup(sid))


@pytest.mark.parametrize("channel, module, recipient, token", [
    (inbound.TELEGRAM, telegram, "555", _TG_TOKEN),
    (inbound.WHATSAPP, whatsapp, "79990000000", _WA_TOKEN),
    (inbound.INSTAGRAM, instagram, "111222333", _IG_TOKEN),
])
def test_resolved_transport_is_accepted_by_its_channel(
    monkeypatch, studio_id, channel, module, recipient, token,
):
    """Ответ уходит в сеть с боевым токеном — по всем подключённым каналам.

    Провал означает не «неудобный интерфейс», а молчащий канал: `send()`
    отказывается ещё до сети, сообщение получает PERMANENT и навсегда остаётся
    failed в очереди исходящих.
    """
    calls = _capture(monkeypatch, module)
    transport = asyncio.run(_transport(studio_id, channel))

    result = asyncio.run(module.send(transport, recipient, {"text": "Привет"}))

    assert result.outcome == channels.ACCEPTED, (
        f"канал {channel} отказался от собственных реквизитов: {result.error}")
    assert len(calls) == 1, f"канал {channel} до сети не дошёл"
    assert token in _secrets(*calls[0]), f"канал {channel} ушёл в сеть без боевого токена"


def test_instagram_transport_carries_the_account_and_api(monkeypatch, studio_id):
    """Instagram адресуется по своей версии Graph API, а не по общей.

    Токен из OAuth на странице AI ходит на graph.instagram.com и адресует
    аккаунт как `me`; токен, введённый руками в Настройках → Интеграции, —
    на graph.facebook.com и по числовому id. По одному токену их не различить,
    поэтому реквизиты обязаны нести и версию API, и аккаунт.
    """
    calls = _capture(monkeypatch, instagram)
    transport = asyncio.run(_transport(studio_id, inbound.INSTAGRAM))

    assert asyncio.run(
        instagram.send(transport, "111222333", {"text": "Привет"})
    ).outcome == channels.ACCEPTED
    assert calls[0][0].startswith(instagram.GRAPH), "ушли не на graph.instagram.com"


def test_instagram_manual_token_uses_the_facebook_graph(monkeypatch, studio_id):
    """Токен, введённый руками в Настройках → Интеграции, — это Facebook Login.

    Его нельзя слать на graph.instagram.com: там он недействителен, и отправка
    отказывает целиком. Версия берётся из подключения, а не угадывается.
    """
    async def _switch():
        async with async_session_maker() as db:
            row = (await db.execute(select(StudioIntegration).where(
                StudioIntegration.studio_id == studio_id,
                StudioIntegration.integration_type == "ig_dm",
            ))).scalar_one()
            row.config = {**row.config, "api": "facebook_login"}
            await db.commit()

    asyncio.run(_switch())
    calls = _capture(monkeypatch, instagram)
    transport = asyncio.run(_transport(studio_id, inbound.INSTAGRAM))

    assert asyncio.run(
        instagram.send(transport, "111222333", {"text": "Привет"})
    ).outcome == channels.ACCEPTED
    assert calls[0][0] == f"{instagram.FACEBOOK_GRAPH}/{_IG_ACCOUNT}/messages"


def test_instagram_falls_back_to_ai_settings_without_a_dm_row(monkeypatch, studio_id):
    """Аккаунт, подключённый до появления services/instagram_account, отвечает.

    Строки ig_dm у таких студий нет вовсе, а токен в studio_ai_settings есть —
    и вебхук пускает их события внутрь именно по нему. Без запасного пути такая
    студия молчала бы, пройдя все проверки подключения.
    """
    async def _drop_dm_row():
        async with async_session_maker() as db:
            await db.execute(delete(StudioIntegration).where(
                StudioIntegration.studio_id == studio_id,
                StudioIntegration.integration_type == "ig_dm",
            ))
            await db.commit()

    asyncio.run(_drop_dm_row())
    calls = _capture(monkeypatch, instagram)
    transport = asyncio.run(_transport(studio_id, inbound.INSTAGRAM))

    assert asyncio.run(
        instagram.send(transport, "111222333", {"text": "Привет"})
    ).outcome == channels.ACCEPTED
    assert _IG_TOKEN in _secrets(*calls[0])


def test_unconnected_channel_never_reaches_the_network(monkeypatch, studio_id):
    """Неподключённый канал — законный исход, а не авария: отказ ДО сети.

    Отличать его обязан транспорт, а не резолв: строка «нет реквизитов» и
    рабочие реквизиты приходят одним и тем же путём.
    """
    async def _disconnect():
        async with async_session_maker() as db:
            await db.execute(delete(StudioIntegration).where(
                StudioIntegration.studio_id == studio_id,
                StudioIntegration.integration_type == "ig_dm",
            ))
            row = (await db.execute(select(StudioAISettings).where(
                StudioAISettings.studio_id == studio_id))).scalar_one()
            row.ig_token = None
            await db.commit()

    asyncio.run(_disconnect())
    calls = _capture(monkeypatch, instagram)
    transport = asyncio.run(_transport(studio_id, inbound.INSTAGRAM))

    assert transport == ""
    assert asyncio.run(
        instagram.send(transport, "111222333", {"text": "Привет"})
    ).outcome == channels.PERMANENT
    assert calls == [], "неподключённый канал сходил в сеть"
