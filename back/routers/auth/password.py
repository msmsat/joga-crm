from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import services.otp as otp
from database import get_db
from dependencies import get_current_user, oauth2_scheme, require_otp
from models import User
from ratelimit import limiter
from schemas import ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest, TokenResponse
from security import get_password_hash, verify_password
from services.sessions import hash_token, revoke_sessions
from ._helpers import _build_token_for_user
# Сессию заводим тем же способом, что и обычный вход, — иначе новый токен не
# попал бы в «Активные сессии» и его нечем было бы отозвать.
from .login import _record_login_session

router = APIRouter()

RESET_ACTION = "reset_password"


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Код восстановления — тот же OTP-механизм, что и у опасных действий внутри
    аккаунта (services/otp): 6 цифр, в БД лежит bcrypt-хэш, TTL 10 минут, не
    больше 5 попыток ввода, код одноразовый. Раньше здесь был бессрочный
    4-значный код открытым текстом в user.verification_code, который печатался в
    консоль вместо письма; подтверждение регистрации жило на том же поле и
    переведено на этот же механизм следом (routers/auth/register.py).

    Ответ одинаков и для существующего, и для несуществующего email — иначе
    ручка работает как проверялка «есть ли у вас аккаунт с таким адресом».
    """
    user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()

    if user:
        # ponytail: OTP один на пользователя, поэтому запрос сюда затирает код,
        # ожидающий по другому действию (смена пароля, 2FA). Ключевать по
        # (user, action) — если это начнёт мешать на практике.
        await otp.issue(db, user, RESET_ACTION)

    return {"message": "Если email существует, код отправлен"}


@router.post("/reset-password", response_model=TokenResponse)
async def reset_password(
    body: ResetPasswordRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Установка нового пароля по коду из письма. Код проверяется ЗДЕСЬ, на
    сервере: клиент, который «уже ввёл код» на своём шаге, ничем не подтверждён
    до этого запроса.

    В ответ отдаём свежий токен: код с почты — это то же доказательство личности,
    что и пароль на /login, так что заставлять входить заново незачем. Тот, кто
    менял пароль из настроек, остаётся в своей студии (её подставит
    `_build_token_for_user` по `last_studio_id`), а пришедший со страницы входа
    попадает сразу в кабинет.
    """
    user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()

    # Один и тот же ответ на «нет такого email» и «неверный код» — по разнице
    # сообщений иначе перебирают адреса.
    if not user or not await otp.verify(db, user, RESET_ACTION, body.code):
        raise HTTPException(status_code=400, detail="Неверный или истёкший код")

    user.hashed_password = get_password_hash(body.new_password)
    user.is_verified = True  # код с почты доказал, что адрес принадлежит ему
    await db.commit()

    # Пароль сбрасывают, когда старый забыт или утёк, — все ПРЕЖНИЕ сессии
    # отзываем: смысл сброса в том, чтобы выбить чужую открытую вкладку.
    # Сессию для нового токена заводим уже после отзыва, иначе снесли бы и её.
    await revoke_sessions(db, user.id)

    # 2FA здесь намеренно не спрашиваем: её второй фактор — код на этот же
    # email, который только что подтверждён. Второе письмо подряд ничего не
    # доказывает, а вход бы сломало.
    access_token = await _build_token_for_user(user, db)
    await _record_login_session(user, access_token, http_request, db)
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _otp: None = Depends(require_otp("change_password")),
):
    """Смена пароля из аккаунта (не «забыл пароль»): текущий пароль +
    код с почты (X-OTP-Token). После успеха — отозвать остальные сессии,
    иначе смена пароля не выкидывает того, кто угнал открытую вкладку."""
    if not verify_password(request.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if request.new_password == request.current_password:
        raise HTTPException(status_code=400, detail="Новый пароль должен отличаться от текущего")

    user.hashed_password = get_password_hash(request.new_password)
    await db.commit()

    await revoke_sessions(db, user.id, except_token_hash=hash_token(token))
    return {"message": "Пароль успешно изменён"}
