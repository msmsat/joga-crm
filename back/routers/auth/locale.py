"""На каком языке открыть сайт — до входа и после.

Приоритет решает сервер, а не фронт, потому что только он видит обе стороны:

1. Вошёл (токен в заголовке) — явно выбранный личный `User.language`.
2. Гость или личного выбора ещё нет — язык страны по IP, иначе английский.
   Язык студии не является личным выбором сотрудника.

Ручка публичная и никогда не отвечает 401: протухший или отозванный токен здесь
значит «гость», а не «выкинуть на /login». Лендинг зовёт её на каждом открытии.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from legal import consent_ip
from models import User
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
    # Нет личного выбора — IP. Язык без перевода — английский.
    return i18n.resolve(raw) if raw else None


@router.get("/locale", response_model=LocaleResponse)
async def get_locale(
    request: Request,
    response: Response,
    token: str | None = Depends(_optional_token),
    db: AsyncSession = Depends(get_db),
):
    # Страна зависит от текущего IP/VPN, ответ нельзя повторять из кэша.
    response.headers["Cache-Control"] = "private, no-store"
    if token:
        language = await _account_language(token, db)
        if language:
            return LocaleResponse(language=language, source="account")
    country = geo_locale.visitor_country(request.headers.get("cf-ipcountry"), consent_ip(request))
    return LocaleResponse(language=geo_locale.language_for_country(country), country=country, source="ip")
