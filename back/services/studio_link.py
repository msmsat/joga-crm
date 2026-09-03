"""Публичный код студии — то, чем студия называется в ссылке мини-приложения.

Раньше ссылка была `/s/<id>`, то есть порядковым номером строки в `studios`:
первая студия платформы получала `/s/1`, вторая `/s/2`. Такая ссылка называет
не только студию, но и всё остальное — сколько студий на платформе и в каком
порядке они появились, — а соседний адрес всегда открывает чужую витрину.
Поэтому у студии есть `public_code`: 10 случайных символов, по которым нельзя
ни посчитать соседей, ни угадать следующего.

Числовые ссылки продолжают работать (`resolve_studio_id` принимает и их): они
уже разошлись по перепискам, кнопкам ботов и письмам, и ломать их нельзя.
Новые адреса строятся только по коду.
"""
import secrets
from typing import Optional, Union

from fastapi import HTTPException
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Studio

# Без похожих друг на друга символов (0/o, 1/l/i) — ссылку диктуют голосом и
# переписывают с экрана телефона. Тот же принцип, что в кодах сертификатов и
# инвайтов, но строчными: код живёт в адресной строке.
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
_LENGTH = 10

# Что мини-приложение прислало в качестве студии: код (`str`) или, для старых
# ссылок и старых сборок клиента, числовой id.
StudioRef = Union[int, str]


def generate_public_code() -> str:
    """31^10 ≈ 8·10^14 вариантов — перебором такой адрес не находят, а на
    совпадение при вставке стоит уникальный индекс."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))


def ref_of(studio: Optional[Studio], studio_id: Optional[int] = None) -> str:
    """Чем назвать студию в ссылке, когда карточка уже под рукой.

    Запасной вариант — числовой id: у студий, созданных до появления кода
    (и в тестах, где Studio собирают руками), поля может не быть, а ссылку
    отдать всё равно надо.
    """
    code = getattr(studio, "public_code", None)
    return code or str(studio_id if studio_id is not None else getattr(studio, "id", ""))


async def public_ref(db: AsyncSession, studio_id: int) -> str:
    """То же, но по одному id — отдельным запросом на первичный ключ.

    Нужно там, куда карточку студии никто не тащит: уведомления, письма,
    возврат из Stripe. Запрос дешёвый и всегда рядом с походом в сеть.
    """
    code = (await db.execute(
        select(Studio.public_code).where(Studio.id == studio_id)
    )).scalar_one_or_none()
    return code or str(studio_id)


async def resolve_studio_id(db: AsyncSession, ref: Optional[StudioRef]) -> Optional[int]:
    """Обратное: из того, что пришло в ссылке, — id студии. None, если студии
    нет (чужой или выдуманный код) либо ссылка студию не называет вовсе."""
    if ref is None:
        return None
    value = str(ref).strip()
    if not value:
        return None
    if value.isdigit():
        return int(value)
    return (await db.execute(
        # Регистр в адресной строке теряется первым: код всегда хранится и
        # ищется строчным.
        select(Studio.id).where(Studio.public_code == value.lower())
    )).scalar_one_or_none()


async def require_studio_id(db: AsyncSession, ref: Optional[StudioRef]) -> int:
    """`resolve_studio_id` для публичных ручек: неизвестный код — 404.

    Ошибку отдаём именно здесь, а не пустым ответом: код в ссылке либо
    существует, либо это опечатка, и человеку надо сказать об этом прямо, а не
    показать витрину без единого занятия.
    """
    studio_id = await resolve_studio_id(db, ref)
    if studio_id is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")
    return studio_id
