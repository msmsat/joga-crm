"""Уникальность контактов (email / телефон) — один guard на все точки входа.

Сравнение нормализованное, а не побайтовое: в БД лежат и «+7 999 123-45-67», и
«79991234567» — для человека это один номер. Хранимые значения здесь не меняются
(нормализация на запись — отдельная задача, см. docs/ROADMAP_ACCOUNTS), нормализуются
только операнды сравнения, симметрично для входного значения и для колонки.

Область действия:
- User  — глобально по продукту (модель глобального аккаунта: один email = один человек);
- Client — в пределах студии (у разных студий клиенты не пересекаются).
"""
import re

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Client, User

# Тексты 409 — совпадают с тем, что показывает фронт живой проверкой.
_MESSAGES = {
    (User, "email"): "Пользователь с таким email уже существует",
    (User, "phone"): "Пользователь с таким телефоном уже существует",
    (Client, "email"): "Клиент с таким email уже есть",
    (Client, "phone"): "Клиент с таким телефоном уже есть",
}


def normalize(field: str, value: str | None) -> str | None:
    """email → trim+lower; телефон → только цифры, ведущая 8 → 7. Пустое → None."""
    if not value or not value.strip():
        return None
    if field == "email":
        return value.strip().lower()
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return digits or None


def normalized_column(model, field: str):
    """Тот же normalize(), но средствами Postgres — для сравнения с колонкой."""
    col = getattr(model, field)
    if field == "email":
        return func.lower(func.trim(col))
    return func.regexp_replace(func.regexp_replace(col, r"\D", "", "g"), r"^8(\d{10})$", r"7\1")


async def contact_taken(
    db: AsyncSession,
    model,
    field: str,
    value: str | None,
    *,
    studio_id: int | None = None,
    exclude_id: int | None = None,
) -> bool:
    """Занят ли контакт кем-то ещё. Пустое значение свободно всегда."""
    normalized = normalize(field, value)
    if normalized is None:
        return False
    q = select(model.id).where(normalized_column(model, field) == normalized)
    if studio_id is not None:
        q = q.where(model.studio_id == studio_id)
    if exclude_id is not None:
        q = q.where(model.id != exclude_id)
    return (await db.execute(q.limit(1))).first() is not None


async def _ensure_free(db, model, email, phone, *, studio_id=None, exclude_id=None) -> None:
    for field, value in (("email", email), ("phone", phone)):
        if await contact_taken(db, model, field, value, studio_id=studio_id, exclude_id=exclude_id):
            raise HTTPException(status_code=409, detail=_MESSAGES[(model, field)])


async def ensure_user_contacts_free(
    db: AsyncSession,
    *,
    email: str | None = None,
    phone: str | None = None,
    exclude_id: int | None = None,
) -> None:
    """409, если email/телефон принадлежит другому пользователю продукта."""
    await _ensure_free(db, User, email, phone, exclude_id=exclude_id)


async def ensure_client_contacts_free(
    db: AsyncSession,
    studio_id: int,
    *,
    email: str | None = None,
    phone: str | None = None,
    exclude_id: int | None = None,
) -> None:
    """409, если email/телефон принадлежит другому клиенту этой студии."""
    await _ensure_free(db, Client, email, phone, studio_id=studio_id, exclude_id=exclude_id)
