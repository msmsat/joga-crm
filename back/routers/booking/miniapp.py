"""Вход клиента в мини-приложение (`/global/*`).

Мини-приложение писалось под бэкенд бота и ходит по его путям. Здесь закрыт
ровно вход — «я уже есть?» и «запомни меня»; расписание, абонементы и брони
мини-приложения по-прежнему смотрят в чужой API.

Своей таблицы у этих ручек нет: клиент мини-приложения — обычный Client CRM,
у него уже есть tg_id, телефон и флаги уведомлений.

БЕЗОПАСНОСТЬ. Токена здесь нет: мини-приложение предъявляет один tg_id, ничем
его не подтверждая, — так устроен клиент, и поменять это со стороны сервера
нельзя. Отсюда два жёстких правила, обойти которые без правок клиента не выйдет:

1. Наружу не отдаётся телефон (см. _public). tg_id человека узнать несложно —
   его видит любой бот, которому тот писал, — и без этого правила endpoint
   работал бы справочником «Telegram-аккаунт → номер телефона» клиентов студии.
2. Существующий клиент студии НЕ привязывается к присланному tg_id, даже если
   телефон совпал. Номер — не доказательство владения: привязка отдала бы
   абонемент, историю и брони тому, кто просто знает чужой номер.

Снять оба ограничения можно только вместе с клиентом: мини-приложение внутри
Telegram должно слать initData, а сервер — проверять её HMAC ботовым токеном и
брать tg_id оттуда; для входа с сайта нужен код по SMS.
"""
import random
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import get_db
from ratelimit import limiter
from models import Client, Studio
from schemas._base import BaseSchema
from services.contacts import normalize, normalized_column

# Палитра одна на все точки входа клиента — дублировать её здесь незачем.
from .public import _AVATAR_COLORS

router = APIRouter()


class MiniappUser(BaseSchema):
    id: int
    tg_id: int
    name: str
    phone: Optional[str]
    notifs_enabled: bool
    reminders_enabled: bool
    registration_date: datetime


class CheckUserRequest(BaseSchema):
    tg_id: int


class CheckUserResult(BaseSchema):
    exists: bool
    message: str
    user: Optional[MiniappUser]


class MiniappRegisterRequest(BaseSchema):
    tg_id: int
    name: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)


def _public(client: Client) -> MiniappUser:
    """Профиль для мини-приложения — всегда без телефона (см. правило 1 в шапке).

    Мини-приложение номер и не показывает: на этих экранах живёт только имя.
    """
    return MiniappUser(
        id=client.id,
        tg_id=client.tg_id,
        name=client.name,
        phone=None,
        notifs_enabled=client.notifs_enabled,
        reminders_enabled=client.reminders_enabled,
        registration_date=client.registration_date,
    )


@router.post("/check-user", response_model=CheckUserResult)
@limiter.limit("10/minute")
async def check_user(
    request: Request,
    body: CheckUserRequest,
    db: AsyncSession = Depends(get_db),
):
    client = (await db.execute(
        select(Client).where(Client.tg_id == body.tg_id)
    )).scalar_one_or_none()

    if client is None:
        return CheckUserResult(exists=False, message="Клиент не найден", user=None)
    return CheckUserResult(exists=True, message="Клиент найден", user=_public(client))


@router.post("/register", response_model=MiniappUser, status_code=201)
@limiter.limit("5/minute")
async def register(
    request: Request,
    body: MiniappRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Знакомство клиента: find-or-create по tg_id, затем по телефону."""
    # Повторный вызов — не ошибка: ключ на устройстве мог пережить чистку кэша,
    # и мини-приложение придёт регистрироваться заново с тем же tg_id.
    client = (await db.execute(
        select(Client).where(Client.tg_id == body.tg_id)
    )).scalar_one_or_none()
    if client is not None:
        return _public(client)

    # ponytail: студию мини-приложение не передаёт (список студий в нём пока
    # моковый), поэтому клиент заводится в первой. Заменяется на studio_id из
    # запроса, когда в мини-приложении появятся настоящие студии.
    studio_id = (await db.execute(select(func.min(Studio.id)))).scalar()
    if studio_id is None:
        raise HTTPException(status_code=503, detail="В системе нет ни одной студии")

    # Телефон уже знаком студии — дальше не идём НИ В КАКОМ случае (правило 2 в
    # шапке модуля). Ни привязки к существующему клиенту, ни второго клиента с
    # тем же номером: первое отдаёт чужой профиль тому, кто знает номер, второе
    # плодит двойников, которых CRM запрещает. Сравнение по цифрам, как в
    # публичной записи: «+380 67 …» и «38067…» — один номер.
    #
    # Ответ одинаков и для «номер занят другим tg_id», и для «клиент студии без
    # tg_id»: разные тексты превратили бы ручку в проверку «есть ли такой номер
    # у студии». Живой клиент студии здесь упирается в стойку ресепшена — пока у
    # входа нет подтверждения по SMS, это дешевле, чем угон аккаунта.
    digits = normalize("phone", body.phone)
    if digits:
        known = (await db.execute(select(Client.id).where(
            Client.studio_id == studio_id,
            normalized_column(Client, "phone") == digits,
        ))).scalars().first()
        if known is not None:
            raise HTTPException(
                status_code=409,
                detail="Этот телефон уже зарегистрирован. Обратитесь в студию.",
            )

    client = Client(
        studio_id=studio_id,
        tg_id=body.tg_id,
        name=body.name,
        phone=body.phone,
        source="online",
        avatar_color=random.choice(_AVATAR_COLORS),
        status="new",
    )
    db.add(client)
    await db.flush()  # нужен client.id для ленты событий
    log_activity(
        db, studio_id, "client",
        title=f"Новый клиент: {client.name}",
        actor_name="Мини-приложение",
        entity_type="client", entity_id=client.id,
    )
    await db.commit()
    await db.refresh(client)
    return _public(client)
