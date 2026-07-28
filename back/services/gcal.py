"""Эпик 6, задача 4: Google Calendar — обмен токенов и синхронизация занятий.

Реализовано через прямые REST-вызовы (`aiohttp`), а не `google-api-python-client`/
`google-auth-oauthlib` (хотя они и в requirements.txt — пришли с Google-логином):
клиент из этих пакетов синхронный (`requests` под капотом), а в асинхронном FastAPI
это блокирует event loop на каждый вызов. Весь остальной код проекта (WhatsApp,
Instagram Graph, Instagram OAuth — routers/ai/instagram.py) уже общается с внешними
API напрямую через aiohttp; этот файл — тот же паттерн, не новый.

Idempotent push: Lesson.gcal_event_id — обратная связь occupation<->event. Ошибки
Google (401 invalid_grant, 404 календарь удалён, 410 событие удалено) — см. функции
ниже, поведение по таблице эпика 4.4.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta

import aiohttp
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Lesson, Studio, StudioIntegration

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_CALENDAR_REDIRECT_URI = os.getenv("GOOGLE_CALENDAR_REDIRECT_URI", "")

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
_CAL_API = "https://www.googleapis.com/calendar/v3"
_TIMEOUT = aiohttp.ClientTimeout(total=10)
_PULL_WINDOW_DAYS = 30
_RATE_LIMIT_RETRIES = 3


class GcalAuthError(Exception):
    """refresh_token отозван/невалиден (401 invalid_grant) — интеграцию нужно отключить."""


class GcalCalendarNotFoundError(Exception):
    """Календарь удалён на стороне Google (404) — интеграцию нужно отключить."""


async def exchange_code(code: str) -> dict:
    """code авторизации -> {access_token, refresh_token, expires_in, ...}."""
    async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
        async with session.post(_TOKEN_URL, data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_CALENDAR_REDIRECT_URI,
            "grant_type": "authorization_code",
        }) as resp:
            resp.raise_for_status()
            return await resp.json()


async def fetch_connected_email(access_token: str) -> str | None:
    async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
        async with session.get(_USERINFO_URL, params={"access_token": access_token}) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
            return data.get("email")


async def _access_token(refresh_token: str) -> str:
    """refresh_token -> свежий access_token (живёт ~час, не храним — см. эпик 4.1)."""
    async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
        async with session.post(_TOKEN_URL, data={
            "refresh_token": refresh_token,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "grant_type": "refresh_token",
        }) as resp:
            if resp.status == 400:
                body = await resp.json()
                if body.get("error") == "invalid_grant":
                    raise GcalAuthError(body.get("error_description", "invalid_grant"))
                resp.raise_for_status()
            resp.raise_for_status()
            data = await resp.json()
            return data["access_token"]


async def revoke_token(refresh_token: str) -> None:
    """Best-effort: локальную интеграцию отключаем в любом случае (см. disconnect_google)."""
    try:
        async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
            async with session.post(_REVOKE_URL, params={"token": refresh_token}):
                pass
    except (aiohttp.ClientError, TimeoutError):
        logger.exception("gcal revoke_token: сетевая ошибка при отзыве")


async def _calendar_request(method: str, access_token: str, path: str, **kwargs) -> dict:
    """GET/POST/PUT/DELETE к Calendar API с ретраем на 403 rateLimitExceeded (эпик 4.4,
    максимум 3 попытки, экспоненциальный backoff). Возвращает распарсенный JSON
    (или None для 204/404/410 — вызывающий код сам решает, что это значит)."""
    headers = {"Authorization": f"Bearer {access_token}"}
    delay = 0.5
    for attempt in range(_RATE_LIMIT_RETRIES):
        async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
            async with session.request(method, f"{_CAL_API}{path}", headers=headers, **kwargs) as resp:
                if resp.status == 403:
                    body = await resp.text()
                    if "rateLimitExceeded" in body or "quotaExceeded" in body:
                        if attempt < _RATE_LIMIT_RETRIES - 1:
                            await asyncio.sleep(delay)
                            delay *= 2
                            continue
                if resp.status in (404, 410, 204):
                    return {"_status": resp.status}
                resp.raise_for_status()
                if resp.status in (200, 201):
                    return await resp.json()
                return {}
    return {"_status": 403}


async def list_calendars(refresh_token: str) -> list[dict]:
    access_token = await _access_token(refresh_token)
    data = await _calendar_request("GET", access_token, "/users/me/calendarList")
    return [
        {"id": item["id"], "name": item.get("summary", item["id"]), "primary": item.get("primary", False)}
        for item in (data.get("items") or [])
    ]


def _event_body(lesson: Lesson, hall_name: str | None, timezone: str) -> dict:
    end_time = lesson.start_time + timedelta(minutes=lesson.duration_min)
    description = f"{lesson.teacher_name} · {hall_name}" if hall_name else lesson.teacher_name
    return {
        "summary": lesson.name,
        "description": description,
        "start": {"dateTime": lesson.start_time.isoformat(), "timeZone": timezone},
        "end": {"dateTime": end_time.isoformat(), "timeZone": timezone},
        "extendedProperties": {"private": {"velora_lesson_id": str(lesson.id)}},
    }


async def _push_one(access_token: str, calendar_id: str, lesson: Lesson, hall_name: str | None, timezone: str) -> str | None:
    """Один занятие -> одно событие Google. Возвращает новый gcal_event_id (None,
    если событие было удалено, т.е. занятие отменено)."""
    if lesson.status == "cancelled":
        if lesson.gcal_event_id:
            await _calendar_request(
                "DELETE", access_token, f"/calendars/{calendar_id}/events/{lesson.gcal_event_id}",
            )
        return None

    body = _event_body(lesson, hall_name, timezone)
    result = {}
    if lesson.gcal_event_id:
        result = await _calendar_request(
            "PUT", access_token, f"/calendars/{calendar_id}/events/{lesson.gcal_event_id}", json=body,
        )
    if not lesson.gcal_event_id or result.get("_status") in (404, 410):
        # Нет привязанного event_id, либо старый недоступен (эпик 4.4: 410 — событие
        # удалено, пересоздаём). Если и создание НОВОГО события отдаёт 404 — значит
        # дело не в конкретном event_id, а в самом календаре (его path, не event-a).
        result = await _calendar_request("POST", access_token, f"/calendars/{calendar_id}/events", json=body)
        if result.get("_status") == 404:
            raise GcalCalendarNotFoundError
    return result.get("id", lesson.gcal_event_id)


async def push_lesson(db: AsyncSession, studio_id: int, lesson_id: int) -> bool:
    """Одно занятие (создание/перенос/отмена) -> Google. Тихо выходит (False), если
    интеграция не подключена/не настроена — вызывающий код не должен на это реагировать,
    это не ошибка. Ошибки Google обрабатывает сама (эпик 4.4): не пробрасывает наружу."""
    integ = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id, StudioIntegration.integration_type == "gcal",
        )
    )).scalar_one_or_none()
    if integ is None or not integ.is_connected:
        return False
    config = integ.config or {}
    calendar_id = config.get("calendar_id")
    refresh_token = config.get("refresh_token")
    if not calendar_id or not refresh_token:
        return False

    lesson = (await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.studio_id == studio_id)
    )).scalar_one_or_none()
    if lesson is None:
        return False

    studio = (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one_or_none()
    timezone = (studio.timezone if studio else None) or "UTC"
    hall_name = lesson.hall.name if lesson.hall_id and lesson.hall else None

    try:
        access_token = await _access_token(refresh_token)
        lesson.gcal_event_id = await _push_one(access_token, calendar_id, lesson, hall_name, timezone)
        await db.commit()
        return True
    except GcalAuthError:
        integ.is_connected = False
        await db.commit()
        logger.warning("gcal push_lesson: refresh_token отозван, studio=%s — интеграция отключена", studio_id)
        return False
    except GcalCalendarNotFoundError:
        integ.is_connected = False
        await db.commit()
        logger.warning("gcal push_lesson: календарь не найден, studio=%s — интеграция отключена", studio_id)
        return False
    except (aiohttp.ClientError, TimeoutError):
        logger.exception("gcal push_lesson failed: studio=%s lesson=%s", studio_id, lesson_id)
        return False


async def sync_studio(db: AsyncSession, studio_id: int, date_from: datetime, date_to: datetime) -> dict:
    """POST /settings/integrations/google/sync — полный ручной прогон окна дат:
    push всех занятий студии + pull «занятости» (two_way). Всегда 200 с errors[] —
    не бросает наружу (владелец жмёт кнопку и ждёт результат, не 500)."""
    integ = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id, StudioIntegration.integration_type == "gcal",
        )
    )).scalar_one_or_none()
    if integ is None or not integ.is_connected:
        return {"pushed": 0, "pulled": 0, "errors": ["Google Calendar не подключён"]}
    config = integ.config or {}
    calendar_id = config.get("calendar_id")
    refresh_token = config.get("refresh_token")
    if not calendar_id or not refresh_token:
        return {"pushed": 0, "pulled": 0, "errors": ["Не выбран календарь"]}

    lesson_ids = (await db.execute(
        select(Lesson.id).where(
            Lesson.studio_id == studio_id,
            Lesson.start_time >= date_from,
            Lesson.start_time < date_to,
        )
    )).scalars().all()

    pushed, errors = 0, []
    for lesson_id in lesson_ids:
        ok = await push_lesson(db, studio_id, lesson_id)
        if ok:
            pushed += 1

    # Интеграция могла отключиться на середине окна (invalid_grant/календарь удалён) —
    # push_lesson уже это обработал, повторную проверку/pull не делаем.
    integ = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id, StudioIntegration.integration_type == "gcal",
        )
    )).scalar_one_or_none()
    if integ is None or not integ.is_connected:
        errors.append("Интеграция отключилась во время синхронизации")
        return {"pushed": pushed, "pulled": 0, "errors": errors}

    pulled = 0
    if config.get("sync_mode") == "two_way":
        try:
            access_token = await _access_token(refresh_token)
            pulled = await _count_busy_events(access_token, calendar_id, date_from, date_to)
        except (GcalAuthError, GcalCalendarNotFoundError):
            pass  # уже помечено is_connected=False внутри push_lesson-путей при первом же сбое
        except (aiohttp.ClientError, TimeoutError):
            logger.exception("gcal sync_studio: pull failed studio=%s", studio_id)
            errors.append("Не удалось прочитать занятость календаря")

    integ.config = {**config, "last_sync_at": datetime.utcnow().isoformat()}
    await db.commit()
    return {"pushed": pushed, "pulled": pulled, "errors": errors}


async def _count_busy_events(access_token: str, calendar_id: str, date_from: datetime, date_to: datetime) -> int:
    """События календаря без velora_lesson_id в окне ±_PULL_WINDOW_DAYS — «занятость»
    владельца, не наши занятия (эпик 4.3). Не создаём из них CRM-занятия и никуда не
    сохраняем (нет ни таблицы, ни контракта отдачи на фронт в этом эпике) — только
    счётчик для ответа sync. Отображение в Журнале — отдельная (не описанная здесь) задача.
    """
    data = await _calendar_request("GET", access_token, f"/calendars/{calendar_id}/events", params={
        "timeMin": date_from.isoformat() + "Z",
        "timeMax": date_to.isoformat() + "Z",
        "singleEvents": "true",
    })
    items = data.get("items") or []
    return sum(1 for e in items if "velora_lesson_id" not in (e.get("extendedProperties", {}).get("private") or {}))


async def disconnect_studio(db: AsyncSession, studio_id: int) -> None:
    """DELETE /settings/integrations/google (эпик, edge cases): отзыв у Google (best-effort)
    + очистка config + обнуление Lesson.gcal_event_id — иначе повторное подключение начнёт
    «обновлять» события, которых уже нет."""
    integ = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id, StudioIntegration.integration_type == "gcal",
        )
    )).scalar_one_or_none()
    if integ is not None and integ.config and integ.config.get("refresh_token"):
        await revoke_token(integ.config["refresh_token"])
    if integ is not None:
        integ.is_connected = False
        integ.config = None
    await db.execute(
        update(Lesson).where(Lesson.studio_id == studio_id, Lesson.gcal_event_id.isnot(None))
        .values(gcal_event_id=None)
    )
    await db.commit()
