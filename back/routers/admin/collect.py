"""Публичный маяк лендинга. Без авторизации: его зовёт браузер анонимного
посетителя, у которого никакого токена ещё нет и быть не может."""
import logging

from fastapi import APIRouter, Depends, Request, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from ratelimit import limiter
from schemas.admin import LandingVisitRequest, PresenceBeatRequest
from services import presence
from services.geo_locale import visitor_country
from services.visit_collector import clip, device_from_ua, record_visit

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/landing/visit", status_code=204, include_in_schema=False)
# Лимит нужен не от людей, а от того, кто решит набить таблицу: маяк открыт
# всему интернету и ничего не требует взамен.
@limiter.limit("60/minute")
async def landing_visit(request: Request, db: AsyncSession = Depends(get_db)):
    # Тело читаем сами и валидируем вручную: маяк обязан отвечать 204 даже на
    # мусор. Штатный 422 от FastAPI рассказал бы случайному любопытному всю
    # схему запроса и подсветил бы ручку как интересную.
    try:
        body = LandingVisitRequest.model_validate(await request.json())
    except (ValidationError, ValueError):
        return Response(status_code=204)

    anon_id = clip(body.anon_id, 64)
    path = clip(body.path, 200)
    if not anon_id or not path:
        return Response(status_code=204)

    country = visitor_country(
        request.headers.get("CF-IPCountry"),
        request.client.host if request.client else None,
    )
    device = device_from_ua(request.headers.get("User-Agent"))

    try:
        await record_visit(
            db,
            anon_id=anon_id,
            path=path,
            referrer=body.referrer,
            utm_source=body.utm_source,
            utm_medium=body.utm_medium,
            utm_campaign=body.utm_campaign,
            lang=body.lang,
            country=country,
            device=device,
        )
    except Exception:
        # Счётчик никогда не ломает страницу, ради которой его позвали.
        logger.warning("не удалось записать визит лендинга", exc_info=True)

    return Response(status_code=204)


@router.post("/presence/beat", status_code=204, include_in_schema=False)
# 120 в минуту при сигнале раз в 20 секунд — запас на общий IP: за одним NAT
# сидит целый офис или вся мобильная сота, и лимит лендинга их бы обрезал.
@limiter.limit("120/minute")
async def presence_beat(request: Request):
    # Ни базы, ни ожидания: сигнал только двигает отметку в памяти. Тело, как и
    # у маяка визитов, разбирается вручную — 204 на мусор вместо рассказа о схеме.
    try:
        body = PresenceBeatRequest.model_validate(await request.json())
    except (ValidationError, ValueError):
        return Response(status_code=204)

    presence.touch(body.surface, clip(body.anon_id, 64) or "")
    return Response(status_code=204)
