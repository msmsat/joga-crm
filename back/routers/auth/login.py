import os
import uuid
from fastapi import APIRouter, HTTPException, Request, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import services.otp as otp
from database import get_db
from models import User, StudioMember, UserSession
from schemas import Login2FARequest, LoginRequest, TokenResponse, GoogleAuthRequest
from security import verify_password, get_password_hash
from services.notifier import notify
from services.sessions import hash_token
from ._helpers import _build_token_for_user

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
router = APIRouter()


def _parse_user_agent(ua: str) -> tuple[str, str, str | None]:
    """(device, platform, browser) — грубый разбор User-Agent без внешних
    зависимостей, для fingerprint'а сессии (N-9, задача 8). Достаточно для
    различения «то же устройство» / «новое устройство», не для аналитики."""
    ua_l = ua.lower()
    if "iphone" in ua_l or "ipad" in ua_l:
        platform = "iOS"
    elif "android" in ua_l:
        platform = "Android"
    elif "mac os" in ua_l or "macintosh" in ua_l:
        platform = "macOS"
    elif "windows" in ua_l:
        platform = "Windows"
    elif "linux" in ua_l:
        platform = "Linux"
    else:
        platform = "Unknown"

    if "edg/" in ua_l:
        browser = "Edge"
    elif "firefox/" in ua_l:
        browser = "Firefox"
    elif "chrome/" in ua_l and "chromium" not in ua_l:
        browser = "Chrome"
    elif "safari/" in ua_l and "chrome/" not in ua_l:
        browser = "Safari"
    else:
        browser = None

    device = "Mobile" if platform in ("iOS", "Android") else "Desktop"
    return device, platform, browser


def _client_ip(forwarded_for: str | None, client_host: str | None) -> str | None:
    """X-Forwarded-For (первый адрес в цепочке прокси) с fallback на
    request.client.host — за обратным прокси сам client.host будет адресом
    прокси, а не пользователя."""
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return client_host


async def _record_login_session(user: User, access_token: str, request: Request, db: AsyncSession) -> None:
    """Фиксирует вход как UserSession и, если fingerprint (device/platform/
    browser) для этого юзера встречается впервые — уведомляет admin/owner всех
    его студий о входе с нового устройства (a9, N-9 задача 8). Не шлёт на
    самой первой сессии аккаунта (регистрация) — иначе шум на каждого нового
    юзера: условие — есть хотя бы одна прошлая сессия, но с другим fingerprint.
    """
    device, platform, browser = _parse_user_agent(request.headers.get("user-agent", ""))

    existing = (await db.execute(
        select(UserSession).where(UserSession.user_id == user.id)
    )).scalars().all()
    is_new_fingerprint = not any(
        s.device == device and s.platform == platform and s.browser == browser
        for s in existing
    )

    db.add(UserSession(
        user_id=user.id, device=device, platform=platform, browser=browser,
        token_hash=hash_token(access_token),
        ip_address=_client_ip(request.headers.get("x-forwarded-for"), request.client.host if request.client else None),
        user_agent=(request.headers.get("user-agent") or "")[:300],
    ))
    await db.commit()

    if not existing or not is_new_fingerprint:
        return

    studio_ids = (await db.execute(
        select(StudioMember.studio_id).where(StudioMember.user_id == user.id)
    )).scalars().all()
    device_label = f"{browser} / {platform}" if browser else platform
    staff_name = f"{user.name} {user.last_name or ''}".strip()
    for studio_id in studio_ids:
        await notify(db, studio_id, "admin", "a9", {
            "staff_name": staff_name,
            "device": device_label,
            "city": "",
        })


async def _finish_login(user: User, http_request: Request, db: AsyncSession) -> TokenResponse:
    """Хвост входа, общий для /login и /google (EPIC 5, задача 5): если у
    пользователя включена 2FA — токен не выдаём, отправляем код и просим
    подтвердить его на /login/2fa. 200, не 401 — это не «токен протух», а
    промежуточный шаг того же входа."""
    if user.two_fa_enabled:
        await otp.issue(db, user, "login_2fa")
        return TokenResponse(access_token=None, token_type="2fa_required", two_fa_required=True)

    access_token = await _build_token_for_user(user, db)
    await _record_login_session(user, access_token, http_request, db)
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/google", response_model=TokenResponse)
async def google_auth(request: GoogleAuthRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    try:
        idinfo = id_token.verify_oauth2_token(
            request.token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=30,
        )
        email = idinfo["email"]
        google_name = idinfo.get("name", "Google User")
    except ValueError as e:
        print("\n" + "!" * 40)
        print(f"ОШИБКА GOOGLE AUTH: {e}")
        print("!" * 40 + "\n")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен Google",
        )

    user = (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(User.email == email, StudioMember.role == 'owner')
    )).scalars().first()

    if not user:
        user = User(
            email=email,
            name=google_name,
            hashed_password=get_password_hash(str(uuid.uuid4())),
            is_verified=True,
            verification_code=None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return await _finish_login(user, http_request, db)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(
            select(User)
            .join(StudioMember, StudioMember.user_id == User.id)
            .where(
                (User.email == request.identifier) | (User.phone == request.identifier),
            )
        )
    ).scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email, телефон или пароль",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Ваш email не подтвержден. Пожалуйста, зарегистрируйтесь заново или введите код.",
        )

    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email, телефон или пароль",
        )

    return await _finish_login(user, http_request, db)


@router.post("/login/2fa", response_model=TokenResponse)
async def login_2fa(request: Login2FARequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    """Второй шаг входа при включённой 2FA (EPIC 5, задача 5)."""
    user = (
        await db.execute(
            select(User).where(
                (User.email == request.identifier) | (User.phone == request.identifier),
            )
        )
    ).scalars().first()

    if user is None or not await otp.verify(db, user, "login_2fa", request.code):
        raise HTTPException(status_code=400, detail="Неверный или истёкший код")

    access_token = await _build_token_for_user(user, db)
    await _record_login_session(user, access_token, http_request, db)
    return TokenResponse(access_token=access_token, token_type="bearer")
