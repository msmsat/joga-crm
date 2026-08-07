"""EPIC 6 задача 2: единый список интеграций GET/DELETE /settings/integrations —
контракт type/connected/details/capabilities, маскирование токена, 422 на неизвестный тип.
Задача 3: маскирование Instagram (_channel_status "ig_dm") — сетевой вызов к Meta
не мокается (в кодовой базе такого паттерна нет и для connect_whatsapp), проверяется
только локальная логика формирования ответа.
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_settings_integrations
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from pydantic import ValidationError
from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioAISettings, StudioIntegration
from routers.settings.integrations import _channel_status, disconnect_integration, list_integrations
from schemas.settings.integrations import IntegrationStatus
from services.assistant import get_or_create_ai_settings


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-SETTINGS-INTEGRATIONS-STUDIO")
        db.add(s)
        await db.commit()
        sid = s.id
        db.add(StudioIntegration(
            studio_id=sid, integration_type="tg_notify", is_connected=True,
            config={"token": "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ", "bot_username": "velora_studio_bot"},
        ))
        db.add(StudioIntegration(
            studio_id=sid, integration_type="ig_dm", is_connected=True,
            config={"token": "IGQWRabc123defGhIJKlmNoPQRsTUVw", "ig_user_id": "17841400000", "username": "velora_studio"},
        ))
        db.add(StudioIntegration(
            studio_id=sid, integration_type="wa_notify", is_connected=True,
            config={"token": "EAAG-wa-token", "phone_number_id": "999", "display_phone_number": "+7 999 000-00-00"},
        ))
        await db.commit()
        # Тумблер WhatsApp-агента включён — отключение номера обязано его погасить.
        ai = await get_or_create_ai_settings(sid, db)
        ai.wa_enabled = True
        await db.commit()
        return sid


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioIntegration).where(StudioIntegration.studio_id == sid))
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid = await _seed()
    try:
        owner = StudioContext(user=None, studio_id=sid, role="owner")

        # GET: 4 типа, в фиксированном порядке; telegram подключён и токен маскирован,
        # остальные (в т.ч. ещё не реализованный google_calendar) — не подключены.
        async with async_session_maker() as db:
            items = await list_integrations(ctx=owner, db=db)
        assert [i.type for i in items] == ["telegram", "whatsapp", "instagram", "google_calendar"], items

        tg = items[0]
        assert tg.connected is True
        assert tg.connected_at is not None
        assert tg.details == {"bot_username": "velora_studio_bot", "token_masked": "123456…wxyZ"}, tg.details
        assert "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ" not in str(tg.details)  # полный токен наружу не уходит
        assert tg.capabilities == ["notify", "booking"]

        ig = items[2]
        assert ig.connected is True
        assert ig.details == {"username": "velora_studio", "token_masked": "IGQWRa…TUVw"}, ig.details
        assert ig.capabilities == ["dm_agent", "booking"]

        gcal = items[3]
        assert gcal.connected is False
        assert gcal.connected_at is None
        assert gcal.details is None

        # _channel_status("ig_dm") — форма ответа POST /integrations/instagram
        # (connect_instagram сам не тестируется: реальный вызов к Meta Graph API,
        # как и у connect_whatsapp, в этой кодовой базе не мокается).
        ig_integ = StudioIntegration(
            is_connected=True,
            config={"token": "IGQWRabc123defGhIJKlmNoPQRsTUVw", "username": "velora_studio"},
        )
        ig_status = _channel_status(ig_integ, "ig_dm")
        assert ig_status.connected is True
        assert ig_status.details == {"username": "velora_studio", "token_masked": "IGQWRa…TUVw"}, ig_status.details

        # DELETE: отключение telegram возвращает ту же схему с connected=False.
        async with async_session_maker() as db:
            disconnected = await disconnect_integration(integration_type="telegram", ctx=owner, db=db)
        assert disconnected.connected is False
        assert disconnected.details is None

        async with async_session_maker() as db:
            items_after = await list_integrations(ctx=owner, db=db)
        assert items_after[0].connected is False

        # DELETE whatsapp гасит и тумблер агента: у него нет своего подключения,
        # иначе при повторном подключении номера он заговорит сам.
        async with async_session_maker() as db:
            wa_off = await disconnect_integration(integration_type="whatsapp", ctx=owner, db=db)
        assert wa_off.connected is False
        async with async_session_maker() as db:
            ai = await get_or_create_ai_settings(sid, db)
            assert ai.wa_enabled is False, "wa_enabled остался включённым после отключения номера"

        # Неизвестный тип -> 422 (валидация Literal на входе схемы/пути).
        try:
            IntegrationStatus(type="yandex", connected=False)
            raise AssertionError("yandex должен быть отвергнут как неизвестный IntegrationType")
        except ValidationError:
            pass

        print("OK: test_settings_integrations")
    finally:
        await _cleanup(sid)


if __name__ == "__main__":
    asyncio.run(_run())
