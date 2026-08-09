"""Вход клиента в мини-приложение (`/global/*`).

Мини-приложение писалось под бэкенд бота и ходит по его путям. Здесь закрыт
вход — «я это я» и «запомни меня»; расписание, абонементы и брони
мини-приложения по-прежнему смотрят в чужой API.

Своей таблицы у этих ручек нет: клиент мини-приложения — обычный Client CRM,
у него уже есть tg_id, телефон и флаги уведомлений.

БЕЗОПАСНОСТЬ. `POST /auth/telegram` проверяет HMAC-подпись Telegram `initData`
(`verify_init_data`) секретом, собранным из ботового токена студии, — только
так подтверждённый `tg_id` попадает в клиентский JWT (`typ: "client"`), которым
подписаны все дальнейшие ручки мини-приложения (`get_current_client`).
`studio_id` эти ручки берут из `client.studio_id` в БД, а не из claim'а
токена, — так виден текущий студийный дом клиента, а не тот, что был на
момент выдачи токена.

Остаётся одно жёсткое правило, обойти которое без правок клиента не выйдет:
существующий клиент студии НЕ привязывается к присланному tg_id по совпадению
телефона, даже когда tg_id уже доказан подписью. Номер — не доказательство
владения аккаунтом Telegram: привязка отдала бы абонемент, историю и брони
тому, кто просто знает чужой номер. Снять это ограничение можно только вместе
с кодом подтверждения по SMS (BACKLOG).

`POST /check-user` — общедоступный справочник «есть ли Telegram-аккаунт у
студии» (им может пользоваться бот-предшественник за пределами этого репо);
отдаёт только `exists: bool`, без профиля — полный профиль без токена был бы
той самой дырой, которую закрывает этот файл.
"""
import hashlib
import hmac
import json
import random
import time
from datetime import datetime
from typing import Optional
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import get_db
from dependencies import SUSPENDED_DETAIL
from services import platform_fee
from ratelimit import limiter
from models import BookingChannelConfig, Client, ReferralRecord
from schemas._base import BaseSchema
from security import ALGORITHM, SECRET_KEY, create_access_token

# Палитра одна на все точки входа клиента — дублировать её здесь незачем.
from .public import _AVATAR_COLORS

router = APIRouter()

client_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="global/auth/telegram", auto_error=False)


def verify_init_data(init_data: str, bot_token: str) -> dict[str, str]:
    """Проверяет подпись Telegram WebApp initData (см. Telegram Bot API docs,
    "Validating data received via the Mini App"). Бросает ValueError на любой
    отказ — вызывающий код превращает его в 401/503 с человекочитаемым текстом.
    """
    pairs = parse_qsl(init_data, keep_blank_values=True)
    data = dict(pairs)
    received_hash = data.pop("hash", None)
    if not received_hash:
        raise ValueError("Отсутствует hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed_hash, received_hash):
        raise ValueError("Подпись не совпадает")

    auth_date = data.get("auth_date")
    if not auth_date or time.time() - int(auth_date) > 24 * 3600:
        raise ValueError("initData устарела")

    return data


class CheckUserRequest(BaseSchema):
    tg_id: int
    studio_id: int


class CheckUserResponse(BaseSchema):
    exists: bool


class TelegramAuthRequest(BaseSchema):
    init_data: str
    studio_id: int
    # Реферальный код из start_param (`s<studio_id>_ref<code>` — код всегда
    # хвостом после студии, парсинг studio_id регексом с якорем только слева
    # его не задевает). Учитывается только при создании НОВОГО клиента.
    referral_code: Optional[str] = None


class ClientAuthUser(BaseSchema):
    """Общая форма ответа на вход клиента — и телеграмного, и по email
    (miniapp_email_auth.py). `tg_id` optional именно поэтому: у клиента,
    зашедшего по ссылке в браузере, Telegram-аккаунта может не быть вовсе.
    """
    id: int
    tg_id: Optional[int]
    name: str
    notifs_enabled: bool
    reminders_enabled: bool
    registration_date: datetime


class ClientAuthResponse(BaseSchema):
    token: str
    user: ClientAuthUser


async def _create_pending_referral(db: AsyncSession, studio_id: int, client: Client, code: str) -> None:
    """Реферальный код из ссылки-приглашения → pending-запись (блок 5,
    EPIC_MA_REAL_BACKEND). Начисление бонуса рефереру этим не делаем — оно уже
    срабатывает на первом визите/оплате отдельным механизмом
    (routers/booking/public.py, routers/clients/loyalty.py), дублировать его
    здесь эпик прямо запрещает.
    """
    referrer = (await db.execute(
        select(Client).where(Client.invite_code == code)
    )).scalar_one_or_none()
    if referrer is None or referrer.id == client.id:
        return
    db.add(ReferralRecord(
        studio_id=studio_id,
        referrer_client_id=referrer.id,
        referred_client_id=client.id,
        status="pending",
    ))
    await db.commit()


@router.post("/check-user", response_model=CheckUserResponse)
@limiter.limit("10/minute")
async def check_user(
    request: Request,
    body: CheckUserRequest,
    db: AsyncSession = Depends(get_db),
):
    exists = (await db.execute(
        select(Client.id).where(Client.tg_id == body.tg_id, Client.studio_id == body.studio_id)
    )).scalars().first() is not None
    return CheckUserResponse(exists=exists)


@router.post("/auth/telegram", response_model=ClientAuthResponse)
@limiter.limit("10/minute")
async def auth_telegram(
    request: Request,
    body: TelegramAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """Проверка initData + find-or-create клиента + выдача клиентского JWT.

    Единственная ручка входа в мини-приложение: заменяет собой прежние
    check-user/register, которые доверяли голому tg_id из тела запроса.
    """
    channel = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == body.studio_id,
            BookingChannelConfig.channel_type == "telegram",
        )
    )).scalar_one_or_none()
    if channel is None or not channel.is_active or not channel.config or not channel.config.get("token"):
        raise HTTPException(status_code=503, detail="Студия не подключила Telegram-бота")
    bot_token = channel.config["token"]

    try:
        verified = verify_init_data(body.init_data, bot_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    try:
        tg_user = json.loads(verified.get("user") or "{}")
        tg_id = tg_user["id"]
    except (json.JSONDecodeError, KeyError, TypeError):
        raise HTTPException(status_code=401, detail="initData не содержит данные пользователя")
    tg_first_name = tg_user.get("first_name") or "Гость"

    # По tg_id одному, без studio_id в условии: Client.tg_id глобально
    # уникален (BigInteger, unique — models/client.py), один Telegram-аккаунт
    # не может быть Client-строкой больше чем в одной студии. Добавить сюда
    # studio_id == body.studio_id значило бы для вернувшегося клиента другой
    # студии не найти его и попытаться вставить второй раз — упадёт на
    # уникальном ограничении вместо того, чтобы просто переиспользовать строку.
    client = (await db.execute(
        select(Client).where(Client.tg_id == tg_id)
    )).scalar_one_or_none()

    if client is None:
        # body.studio_id — единственный studio_id, которому здесь можно
        # доверять: тот, чей ботовый токен только что подтвердил подпись.
        try:
            client = Client(
                studio_id=body.studio_id,
                tg_id=tg_id,
                name=tg_first_name,
                source="online",
                avatar_color=random.choice(_AVATAR_COLORS),
                status="new",
            )
            db.add(client)
            await db.flush()  # нужен client.id для ленты событий
            log_activity(
                db, body.studio_id, "client",
                title=f"Новый клиент: {client.name}",
                actor_name="Мини-приложение",
                entity_type="client", entity_id=client.id,
            )
            await db.commit()
            await db.refresh(client)

            if body.referral_code:
                await _create_pending_referral(db, body.studio_id, client, body.referral_code)
        except IntegrityError:
            # Гонка: параллельный запрос для того же нового tg_id (двойной
            # тап, повторный маунт) успел вставить строку между нашим SELECT
            # и этим INSERT. Не 500-им — переиспользуем то, что вставили они.
            await db.rollback()
            client = (await db.execute(
                select(Client).where(Client.tg_id == tg_id)
            )).scalar_one_or_none()

    if client is None or client.studio_id != body.studio_id:
        # client is None: гонка выше всё-таки не оставила строку — не
        # должно случаться, но не доверяем молча.
        # client.studio_id != body.studio_id: этот Telegram-аккаунт уже
        # Client другой студии. Раз tg_id глобально уникален, один человек
        # физически не может быть клиентом двух студий — молча логинить его
        # в чужую студию нельзя: любой сторонний бот, получивший ЕГО
        # настоящий, валидный initData (студия B, к которой человек никогда
        # не имел отношения), иначе получил бы рабочий токен на аккаунт
        # клиента студии A и мог бы читать его абонемент/историю и
        # бронировать за него.
        raise HTTPException(status_code=403, detail="Этот Telegram-аккаунт уже привязан к другой студии")

    # Токен несёт studio_id клиента КАК ОН ЕСТЬ В БД (может отличаться от
    # body.studio_id для уже существующего клиента), но блоки 2-6 всё равно
    # обязаны брать studio_id из client.studio_id в get_current_client, а не
    # из этого claim'а — тогда смена студии клиента видна сразу, без
    # переиздания токена.
    token = create_access_token(
        {"sub": str(client.id), "typ": "client", "studio_id": client.studio_id},
        expires_minutes=60 * 24 * 30,
    )
    return ClientAuthResponse(
        token=token,
        user=ClientAuthUser(
            id=client.id,
            tg_id=client.tg_id,
            name=client.name,
            notifs_enabled=client.notifs_enabled,
            reminders_enabled=client.reminders_enabled,
            registration_date=client.registration_date,
        ),
    )


async def get_current_client(
    token: Optional[str] = Depends(client_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Client:
    """Клиент мини-приложения по клиентскому JWT (`typ: "client"`, выдаётся
    `POST /auth/telegram`). Все ручки блоков 2-6 висят на этой зависимости.

    studio_id для них — `client.studio_id` с этой строки (актуальное
    состояние БД), НЕ claim токена: см. комментарий в auth_telegram.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    if payload.get("typ") != "client":
        raise HTTPException(status_code=401, detail="Недействительный токен")

    try:
        client_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Недействительный токен")

    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.is_active.is_(True))
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    # Студия не оплатила счёт за комиссию — мини-приложение закрывается вместе с
    # CRM. Иначе клиенты продолжали бы записываться и платить в студию, которой
    # платформа уже отключила кабинет: записи копились бы там, где их некому
    # обработать. 402, а не 401 — токен клиента исправен, дело в студии.
    if await platform_fee.studio_suspended(db, client.studio_id):
        raise HTTPException(status_code=402, detail=SUSPENDED_DETAIL)
    return client


if __name__ == "__main__":
    from urllib.parse import urlencode

    test_token = "123456:TEST-TOKEN"
    fields = {"auth_date": str(int(time.time())), "query_id": "AAA", "user": '{"id":42,"first_name":"Test"}'}
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", test_token.encode(), hashlib.sha256).digest()
    valid_hash = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    valid_init_data = urlencode({**fields, "hash": valid_hash})

    result = verify_init_data(valid_init_data, test_token)
    assert result["auth_date"] == fields["auth_date"]

    tampered = valid_init_data.replace(valid_hash, "0" * 64)
    try:
        verify_init_data(tampered, test_token)
        assert False, "tampered hash must fail"
    except ValueError:
        pass

    old_fields = {**fields, "auth_date": str(int(time.time()) - 25 * 3600)}
    old_check_string = "\n".join(f"{k}={v}" for k, v in sorted(old_fields.items()))
    old_hash = hmac.new(secret, old_check_string.encode(), hashlib.sha256).hexdigest()
    old_init_data = urlencode({**old_fields, "hash": old_hash})
    try:
        verify_init_data(old_init_data, test_token)
        assert False, "expired auth_date must fail"
    except ValueError:
        pass

    print("verify_init_data self-check ok")
