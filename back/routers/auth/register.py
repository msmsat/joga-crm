"""Регистрация по email и подтверждение почты.

Код подтверждения — тот же механизм, что у восстановления пароля и опасных
действий внутри аккаунта (services/otp): 6 цифр из `secrets`, в БД только
bcrypt-хэш, TTL 10 минут, не больше 5 попыток ввода, код одноразовый и привязан к
действию. Своей генерации здесь больше нет.

До этого код был 4-значный, из `random`, лежал в БД ОТКРЫТЫМ ТЕКСТОМ, без срока
годности и без счётчика попыток — то есть 10 000 комбинаций перебирались за
минуты. Рядом лежала вторая половина: повторная регистрация на неподтверждённый
адрес перезаписывает пароль (это штатное поведение — человек забыл пароль, не
дойдя до подтверждения). Вместе они давали захват любой начатой, но не
завершённой регистрации: назначь свой пароль и подбери код.
"""
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import services.otp as otp
from database import get_db
from legal import CONSENT_REQUIRED, record_consent
from models import User
from ratelimit import limiter
from schemas import RegisterRequest, TokenResponse, VerifyEmailRequest
from security import get_password_hash
from ._helpers import _build_token_for_user

logger = logging.getLogger(__name__)
router = APIRouter()

VERIFY_ACTION = "verify_email"


@router.post("/register")
# Каждый вызов отправляет письмо на указанный адрес. Без лимита это рассылка с
# нашего SMTP на любой адрес в неограниченном темпе — то есть репутация домена.
@limiter.limit("5/minute")
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Согласие с Условиями и Политикой — обязательное условие создания аккаунта,
    # и проверяется на сервере: галочка на фронте убирается правкой DOM.
    if not body.accept_terms:
        raise HTTPException(status_code=400, detail=CONSENT_REQUIRED)

    existing_user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()

    hashed_pwd = get_password_hash(body.password)

    if existing_user:
        if existing_user.is_verified:
            raise HTTPException(
                status_code=400,
                detail="Пользователь с таким email уже зарегистрирован",
            )
        existing_user.name = body.name
        existing_user.hashed_password = hashed_pwd
        # Повторная регистрация на неподтверждённый аккаунт — то же принятие
        # документов заново: пишем ещё одну строку, а не молчим (таблица
        # append-only, см. models.UserConsent).
        await record_consent(db, existing_user, request, "register")
        await db.commit()

        # issue коммитит сам и шлёт письмо — после записи согласия, чтобы код не
        # уехал раньше, чем зафиксирован аккаунт, которому он выдан.
        await otp.issue(db, existing_user, VERIFY_ACTION)
        return {"message": "Новый код подтверждения отправлен на почту"}

    new_user = User(
        email=body.email,
        name=body.name,
        hashed_password=hashed_pwd,
        is_verified=False,
    )
    db.add(new_user)
    # flush, а не commit: id нужен для строки согласия, но аккаунт и его
    # доказательство должны лечь одной транзакцией.
    await db.flush()
    await record_consent(db, new_user, request, "register")
    await db.commit()

    await otp.issue(db, new_user, VERIFY_ACTION)
    return {"message": "Код подтверждения отправлен на почту"}


@router.post("/verify-email", response_model=TokenResponse)
# Перебор кода закрыт счётчиком попыток в самом OTP (5 на код), но лимит по IP
# нужен и здесь: без него перебор идёт по РАЗНЫМ адресам — запросил новый код,
# сжёг пять попыток, повторил. Пять кодов в минуту это уже не перебор.
@limiter.limit("10/minute")
async def verify_email(
    body: VerifyEmailRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()

    # Один и тот же отказ на «нет такого пользователя», «уже подтверждён» и
    # «неверный код»: три разных ответа работали как проверялка «есть ли у вас
    # аккаунт с таким адресом» — ровно то, что закрыто в forgot-password.
    if user is None or user.is_verified or not await otp.verify(db, user, VERIFY_ACTION, body.code):
        raise HTTPException(status_code=400, detail="Неверный или истёкший код подтверждения")

    user.is_verified = True
    await db.commit()

    access_token = await _build_token_for_user(user, db)
    return TokenResponse(access_token=access_token, token_type="bearer")
