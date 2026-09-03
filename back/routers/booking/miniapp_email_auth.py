"""Вход клиента в мини-приложение по email — вне Telegram (`/global/auth/email/*`).

Вторая дверь в тот же кабинет, что и `POST /auth/telegram` (miniapp.py): выдаёт
ТОТ ЖЕ клиентский JWT (`typ: "client"`, `sub = client.id`), поэтому отдельной
«веб-сессии» рядом с телеграмной не существует — `get_current_client` не знает
и не спрашивает, какой дверью выдан токен, а значит и склеивать между собой
нечего.

БЕЗОПАСНОСТЬ. Личность подтверждается кодом на почту (`ClientEmailOtp`,
models/client.py). Телефон доказательством по-прежнему не считается — см.
комментарий в miniapp.py о том, почему совпадение номера НЕ логинит в чужую
карточку. Подтверждённый email считается: письмо приходит владельцу ящика, а не
всякому, кто знает адрес.

Ключ клиента здесь — пара (studio_id, email), как у публичной записи по
(studio_id, phone) в public.py, а НЕ глобальная уникальность вроде tg_id:
клиент студии А, пришедший в студию Б, должен получить там свою карточку, а не
403. Сравнение нормализованное (services/contacts.py) — в БД лежат адреса как
их вбили руками в CRM, а `NormEmail` на входе уже привёл присланный к канону.

ПРИВЯЗКА. `POST /auth/email/verify` с уже действующим Bearer не логинит, а
записывает подтверждённый email текущему клиенту. Это единственный способ
склеить телеграмную карточку с веб-входом: человек, заведённый по tg_id,
подтверждает почту изнутри Telegram — и дальше входит по ней в браузере в ТУ ЖЕ
карточку, со своим абонементом и историей, вместо того чтобы завести вторую.
"""
import random
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import get_db
from models import Client, ClientEmailOtp, Studio
from ratelimit import limiter
from schemas._base import BaseSchema, NormEmail
from security import create_access_token, get_password_hash, verify_password
from services.contacts import contact_taken, normalize, normalized_column
from services.email_layout import code_block
from services.i18n import pick, resolve
from services.mailer import send_email
from services.studio_link import StudioRef, require_studio_id

from .miniapp import (
    ClientAuthResponse, ClientAuthUser, _create_pending_referral,
    client_oauth2_scheme, get_current_client,
)
from .public import _AVATAR_COLORS

router = APIRouter()

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5

# Один текст 400 на все отказы сверки: «нет кода», «протух», «не совпал» и
# «кончились попытки» — снаружи неотличимы, иначе ответы сами подсказывают
# перебирающему, в каком он состоянии.
_BAD_CODE = "Неверный или истёкший код"


class EmailCodeRequest(BaseSchema):
    # Публичный код студии из ссылки `/s/<code>`; число тоже принимается — так
    # приходят старые ссылки (services/studio_link).
    studio_id: StudioRef
    email: NormEmail


class EmailCodeResponse(BaseSchema):
    expires_in: int
    # Заводим ли нового клиента — фронт по нему решает, спрашивать ли имя на
    # шаге кода. Да, это способ узнать, есть ли такой email у студии; ровно тем
    # же осознанно отвечает `POST /check-user` про tg_id (см. шапку miniapp.py).
    # Плата за то, чтобы у вернувшегося клиента не спрашивали имя заново.
    is_new: bool


class EmailVerifyRequest(BaseSchema):
    # Публичный код студии — см. EmailCodeRequest.
    studio_id: StudioRef
    email: NormEmail
    code: str
    # Только для нового клиента; у существующего игнорируется, чтобы вход по
    # чужому коду не мог переименовать карточку.
    name: Optional[str] = None
    referral_code: Optional[str] = None


async def _optional_client(
    token: Optional[str] = Depends(client_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[Client]:
    """Клиент из Bearer, если он есть и жив. Иначе None — без 401.

    Протухший токен на экране входа не ошибка, а ровно тот случай, ради
    которого человек и вводит email: молча идём по пути логина.
    """
    if not token:
        return None
    try:
        return await get_current_client(token=token, db=db)
    except HTTPException:
        return None


# Письмо уходит КЛИЕНТУ студии, поэтому язык берём студийный: свой язык
# интерфейса клиент нигде не выбирает, а мини-приложение он видит на языке,
# который студия задала в «Онлайн-записи».
_CODE_SUBJECT = {
    "ru": "Код входа — {studio}", "en": "Login code — {studio}",
    "uk": "Код входу — {studio}", "cs": "Přihlašovací kód — {studio}",
    "de": "Anmeldecode — {studio}",
}

_CODE_BODY = {
    "ru": ("<p>Введите этот код, чтобы войти в свой кабинет.</p>{code}"
           "<p>Код действует {minutes} минут. "
           "Если вход запрашивали не вы — письмо можно удалить.</p>"),
    "en": ("<p>Enter this code to sign in to your account.</p>{code}"
           "<p>The code is valid for {minutes} minutes. "
           "If you didn't request it, you can delete this email.</p>"),
    "uk": ("<p>Введіть цей код, щоб увійти до свого кабінету.</p>{code}"
           "<p>Код діє {minutes} хвилин. "
           "Якщо вхід запитували не ви — лист можна видалити.</p>"),
    "cs": ("<p>Zadejte tento kód a přihlaste se do své zóny.</p>{code}"
           "<p>Kód platí {minutes} minut. "
           "Pokud jste o přihlášení nežádali, e-mail můžete smazat.</p>"),
    "de": ("<p>Geben Sie diesen Code ein, um sich anzumelden.</p>{code}"
           "<p>Der Code gilt {minutes} Minuten. "
           "Haben Sie ihn nicht angefordert, können Sie diese E-Mail löschen.</p>"),
}


@router.post("/auth/email/request", response_model=EmailCodeResponse, status_code=202)
@limiter.limit("3/minute")
async def request_email_code(
    request: Request,
    body: EmailCodeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Код подтверждения на почту. Строка одна на пару (студия, email):
    повторный запрос затирает предыдущий код, а не копит параллельно валидные.
    """
    # Код из ссылки разрешаем один раз, на входе: дальше по функции studio_id —
    # обычный int (services/studio_link).
    body.studio_id = await require_studio_id(db, body.studio_id)
    studio = (await db.execute(
        select(Studio).where(Studio.id == body.studio_id)
    )).scalar_one_or_none()
    if studio is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")

    code = f"{secrets.randbelow(1_000_000):06d}"  # secrets, не random
    otp = (await db.execute(
        select(ClientEmailOtp).where(
            ClientEmailOtp.studio_id == body.studio_id,
            ClientEmailOtp.email == body.email,
        )
    )).scalar_one_or_none()
    if otp is None:
        otp = ClientEmailOtp(studio_id=body.studio_id, email=body.email)
        db.add(otp)
    otp.code_hash = get_password_hash(code)
    otp.expires_at = datetime.utcnow() + CODE_TTL
    otp.attempts = 0
    await db.commit()

    is_new = (await db.execute(
        select(Client.id).where(
            Client.studio_id == body.studio_id,
            normalized_column(Client, "email") == body.email,
        )
    )).scalars().first() is None

    lang = resolve(studio.language)
    await send_email(
        body.email,
        pick(_CODE_SUBJECT, lang).format(studio=studio.name),
        pick(_CODE_BODY, lang).format(
            code=code_block(code), minutes=int(CODE_TTL.total_seconds() // 60),
        ),
        brand=studio.name,
        lang=lang,
    )
    return EmailCodeResponse(expires_in=int(CODE_TTL.total_seconds()), is_new=is_new)


async def _consume_code(db: AsyncSession, studio_id: int, email: str, code: str) -> None:
    """Сверяет код и гасит его. Любой отказ — 400 с одним и тем же текстом."""
    otp = (await db.execute(
        select(ClientEmailOtp).where(
            ClientEmailOtp.studio_id == studio_id,
            ClientEmailOtp.email == email,
        )
    )).scalar_one_or_none()
    if otp is None:
        raise HTTPException(status_code=400, detail=_BAD_CODE)

    if datetime.utcnow() > otp.expires_at or otp.attempts >= MAX_ATTEMPTS:
        await db.delete(otp)
        await db.commit()
        raise HTTPException(status_code=400, detail=_BAD_CODE)

    # Счётчик растёт ДО ответа и своим коммитом: иначе неудачная попытка,
    # откатившаяся вместе с запросом, ничего не стоила бы перебирающему.
    otp.attempts += 1
    await db.commit()
    if not verify_password(code, otp.code_hash):
        raise HTTPException(status_code=400, detail=_BAD_CODE)

    await db.delete(otp)  # одноразовость; коммитится вместе с самим входом
    await db.flush()


@router.post("/auth/email/verify", response_model=ClientAuthResponse)
@limiter.limit("10/minute")
async def verify_email_code(
    request: Request,
    body: EmailVerifyRequest,
    current: Optional[Client] = Depends(_optional_client),
    db: AsyncSession = Depends(get_db),
):
    """Код верен → вход в карточку клиента (или привязка почты, если уже вошёл)."""
    body.studio_id = await require_studio_id(db, body.studio_id)
    await _consume_code(db, body.studio_id, body.email, body.code)

    if current is not None:
        # Привязка: подтверждённая почта достаётся тому, кто УЖЕ доказал свою
        # личность телеграмным входом. Занятую почту не отдаём — иначе привязка
        # стала бы способом получить чужую карточку с её абонементом.
        if await contact_taken(db, Client, "email", body.email,
                               studio_id=current.studio_id, exclude_id=current.id):
            raise HTTPException(status_code=409, detail="Этот email уже привязан к другому клиенту студии")
        current.email = body.email
        await db.commit()
        await db.refresh(current)
        return _auth_response(current)

    client = (await db.execute(
        select(Client).where(
            Client.studio_id == body.studio_id,
            normalized_column(Client, "email") == body.email,
        )
    )).scalars().first()

    if client is None:
        # Имени в почте нет — берём часть до «собаки», чтобы карточка в CRM не
        # называлась пустой строкой, если фронт имя не прислал.
        client = Client(
            studio_id=body.studio_id,
            name=(body.name or "").strip() or body.email.split("@")[0],
            email=body.email,
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
    else:
        await db.commit()  # гасит израсходованный код

    return _auth_response(client)


def _auth_response(client: Client) -> ClientAuthResponse:
    """Тот же токен, что выдаёт вход через Telegram, — см. шапку файла."""
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


if __name__ == "__main__":
    # Нормализация — единственная чистая логика этого файла: адрес, введённый
    # в браузере как попало, обязан найти карточку, заведённую в CRM руками.
    assert normalize("email", "  Sadomat31@Gmail.COM ") == "sadomat31@gmail.com"
    assert normalize("email", "") is None
    assert "a.b+tag@x.io".split("@")[0] == "a.b+tag"
    print("miniapp_email_auth self-check ok")
