"""На каком языке открыть сайт — до входа и после.

Приоритет решает сервер, а не фронт, потому что только он видит обе стороны:

1. Вошёл (токен в заголовке) — язык из БД: личный `User.language`, не выбран —
   язык активной студии. Ровно тот, что покажет кабинет (DashboardLayout).
2. Гость, или в аккаунте языка ещё нет (онбординг не пройден) — язык страны
   по IP (services/geo_locale).

Ручка публичная и никогда не отвечает 401: протухший или отозванный токен здесь
значит «гость», а не «выкинуть на /login». Лендинг зовёт её на каждом открытии.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user, get_studio_context
from legal import consent_ip
from models import Studio, User
from schemas.auth.responses import LocaleResponse
from services import geo_locale, i18n

router = APIRouter()

# auto_error=False: без токена зависимость отдаёт None, а не 401.
_optional_token = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


async def _account_language(token: str, db: AsyncSession) -> str | None:
    try:
        user: User = await get_current_user(token=token, db=db)
    except HTTPException:
        return None
    raw = user.language
    if not raw:
        try:
            ctx = await get_studio_context(token=token, user=user, db=db)
        except HTTPException:
            # Студии ещё нет или не выбрана из нескольких — языка в БД нет.
            return None
        studio = await db.get(Studio, ctx.studio_id)
        raw = studio.language if studio else None
    # «pl» у студии — языка интерфейса нет, кабинет покажет английский; лендинг тоже.
    return i18n.resolve(raw) if raw else None


@router.get("/locale", response_model=LocaleResponse)
async def get_locale(
    request: Request,
    token: str | None = Depends(_optional_token),
    db: AsyncSession = Depends(get_db),
):
    if token:
        language = await _account_language(token, db)
        if language:
            return LocaleResponse(language=language, source="account")
    country = geo_locale.visitor_country(request.headers.get("cf-ipcountry"), consent_ip(request))
    return LocaleResponse(language=geo_locale.language_for_country(country), country=country, source="ip")
