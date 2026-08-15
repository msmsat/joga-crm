"""Единый OTP-механизм (EPIC 5, задача 3): смена пароля, danger zone, 2FA.

Один код на пользователя, скоуп — action: подтверждение, выданное под
"change_password", не сработает для "delete_account". Код хранится хэшем
(bcrypt, как пароль) — дамп БД не даёт возможности подтвердить чужое действие.
"""
import secrets
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from models import User
from security import get_password_hash, verify_password
from services.email_layout import code_block
from services.mailer import send_email

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5

_SUBJECTS = {
    "change_password": "Код для смены пароля Velora",
    "reset_password": "Код восстановления пароля Velora",
    "delete_data": "Код для очистки данных студии Velora",
    "delete_account": "Код для удаления студии Velora",
    "enable_2fa": "Код для включения двухфакторной аутентификации Velora",
    "login_2fa": "Код входа Velora",
}


async def issue(db: AsyncSession, user: User, action: str) -> None:
    code = f"{secrets.randbelow(1_000_000):06d}"  # secrets, не random
    user.otp_code_hash = get_password_hash(code)
    user.otp_action = action
    user.otp_expires_at = datetime.utcnow() + CODE_TTL
    user.otp_attempts = 0
    await db.commit()
    subject = _SUBJECTS.get(action, "Код подтверждения Velora")
    minutes = int(CODE_TTL.total_seconds() // 60)
    await send_email(
        user.email, subject,
        "<p>Введите этот код в приложении, чтобы подтвердить действие.</p>"
        + code_block(code)
        + f"<p>Код действует {minutes} минут. Если это были не вы — просто "
        "проигнорируйте письмо, ничего не произойдёт.</p>",
    )


async def verify(db: AsyncSession, user: User, action: str, code: str) -> bool:
    if user.otp_action != action or not user.otp_expires_at or datetime.utcnow() > user.otp_expires_at:
        return False
    if user.otp_attempts >= MAX_ATTEMPTS:
        return False  # брутфорс 6 цифр закрыт
    user.otp_attempts += 1
    ok = verify_password(code, user.otp_code_hash or "")
    if ok:
        user.otp_code_hash = None
        user.otp_action = None
        user.otp_expires_at = None  # одноразовость
    await db.commit()
    return ok
