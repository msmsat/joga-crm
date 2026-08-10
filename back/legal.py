"""Юридические документы продукта и фиксация согласия с ними.

Схема — clickwrap, стандартная для EU SaaS: пользователь ставит галочку при
регистрации, а мы храним доказательство (кто, какая редакция, когда, с какого
IP). Подпись — от руки или электронная — для подписки на CRM не требуется.

TERMS_VERSION поднимать РУКАМИ при каждой правке static/terms.html или
static/privacy.html и ставить ту же дату в шапку этих файлов. Версия — это то,
чем доказывается «человек согласился именно с этой редакцией»; без её подъёма
старые согласия молча начнут выглядеть как согласия с новым текстом.
"""
import os

from dotenv import load_dotenv
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from models import User, UserConsent

load_dotenv()

# Дата редакции Условий, Приложения об обработке данных и Политики.
TERMS_VERSION = "2026-08-10.2"

# Публичные адреса документов (их же показывает фронт: front/src/utils/legal.ts).
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
TERMS_URL = f"{BACKEND_URL}/static/terms.html"
PRIVACY_URL = f"{BACKEND_URL}/static/privacy.html"


# Отказ в едином для проекта виде {code, message} (как billing.*): фронту нужен
# именно код — на нём страница входа показывает галочку и повторяет запрос.
CONSENT_REQUIRED = {
    "code": "consent_required",
    "message": "Примите Условия использования и Политику конфиденциальности",
}


def consent_ip(request: Request | None) -> str | None:
    """IP человека, а не обратного прокси. Порядок тот же, что у сессий входа
    (routers/auth/login._client_ip): за прокси request.client.host — адрес
    прокси, и в доказательстве согласия он бесполезен."""
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def record_consent(
    db: AsyncSession, user: User, request: Request | None, source: str
) -> None:
    """Фиксирует принятие документов. Коммит — за вызывающим: согласие обязано
    попасть в ту же транзакцию, что и создание аккаунта, иначе аккаунт может
    появиться без доказательства."""
    user_agent = request.headers.get("user-agent", "") if request else ""
    db.add(UserConsent(
        user_id=user.id,
        version=TERMS_VERSION,
        source=source,
        ip=consent_ip(request),
        user_agent=user_agent[:400] or None,
    ))
