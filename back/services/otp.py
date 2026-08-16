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
from services.email_layout import code_block, greeting
from services.mailer import send_email

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5

_SUBJECTS = {
    "verify_email": "Код подтверждения Velora",
    "change_password": "Код для смены пароля Velora",
    "reset_password": "Код восстановления пароля Velora",
    "delete_data": "Код для очистки данных студии Velora",
    "delete_account": "Код для удаления студии Velora",
    "enable_2fa": "Код для включения двухфакторной аутентификации Velora",
    "login_2fa": "Код входа Velora",
}

# Что именно подтверждает код. «Введите код подтверждения» — письмо, по которому
# нельзя понять, что подтверждаешь; человек, получивший его неожиданно, обязан
# увидеть в первой строке, что кто-то пытается сделать с его аккаунтом.
_PURPOSE = {
    "verify_email": "подтвердить адрес почты",
    "change_password": "сменить пароль",
    "reset_password": "задать новый пароль",
    "delete_data": "удалить все данные студии",
    "delete_account": "удалить студию",
    "enable_2fa": "включить вход по коду",
    "login_2fa": "войти в аккаунт",
}

# Необратимое действие — предупреждение отдельным блоком, а не строкой в тексте.
_DANGER = {"delete_data", "delete_account"}


async def issue(db: AsyncSession, user: User, action: str) -> None:
    code = f"{secrets.randbelow(1_000_000):06d}"  # secrets, не random
    user.otp_code_hash = get_password_hash(code)
    user.otp_action = action
    user.otp_expires_at = datetime.utcnow() + CODE_TTL
    user.otp_attempts = 0
    await db.commit()
    subject = _SUBJECTS.get(action, "Код подтверждения Velora")
    minutes = int(CODE_TTL.total_seconds() // 60)
    purpose = _PURPOSE.get(action, "подтвердить действие")
    warning = (
        "<p>Действие необратимо: восстановить удалённое мы не сможем — "
        "ни по просьбе, ни из резервной копии.</p>" if action in _DANGER else ""
    )
    await send_email(
        user.email, subject,
        f"<p>Кто-то запросил код, чтобы <b style=\"color:#1A1A1A\">{purpose}</b>. "
        "Если это вы — введите его на открытой странице.</p>"
        + code_block(code)
        + f"<p>Код действует {minutes} минут и сгорает после первого верного ввода. "
        "Мы никогда не спрашиваем его в переписке — если код просят прислать, "
        "это не мы.</p>"
        + warning
        + "<p>Запроса не было? Ничего делать не нужно: без кода действие не "
        "выполнится. Но пароль в таком случае лучше сменить.</p>",
        greeting=greeting(user.name),
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
