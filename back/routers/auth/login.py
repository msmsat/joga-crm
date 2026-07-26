import hashlib
import os
import uuid
from fastapi import APIRouter, HTTPException, Request, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, StudioMember, UserSession
from schemas import LoginRequest, TokenResponse, GoogleAuthRequest
from security import verify_password, get_password_hash
from services.notifier import notify
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
        is_current=True, token_hash=hashlib.sha256(access_token.encode()).hexdigest(),
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

    access_token = await _build_token_for_user(user, db)
    await _record_login_session(user, access_token, http_request, db)
    return TokenResponse(access_token=access_token, token_type="bearer")


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

    access_token = await _build_token_for_user(user, db)
    await _record_login_session(user, access_token, http_request, db)
    return TokenResponse(access_token=access_token, token_type="bearer")
