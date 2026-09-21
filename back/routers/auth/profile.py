import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import jwt

from database import get_db
from models import Studio, StudioBillingPlan, StudioMember, User
from dependencies import get_current_user, oauth2_scheme, require_otp, SECRET_KEY, ALGORITHM
from schemas.auth import DeleteMeRequest, ProfileUpdate
from services import stripe_billing
from services.contacts import contact_taken, ensure_user_contacts_free

logger = logging.getLogger(__name__)
router = APIRouter()


def _me_payload(user: User, token: str) -> dict:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return {
        "email": user.email,
        "name": user.name,
        "last_name": user.last_name,
        "phone": user.phone,
        "tg_id": user.tg_id,
        "is_onboarded": user.is_onboarded,
        "studio_id": payload.get("studio_id"),
        "role": payload.get("role"),
        "two_fa_enabled": user.two_fa_enabled,
    }


@router.get("/me")
async def get_me(
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
):
    return _me_payload(current_user, token)


@router.patch("/me")
async def update_me(
    data: ProfileUpdate,
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    patch = data.model_dump(exclude_unset=True)
    # Только изменённый телефон — прежнее значение своё же, конфликтом не считается.
    phone = patch.get("phone")
    await ensure_user_contacts_free(
        db,
        phone=phone if phone != current_user.phone else None,
        exclude_id=current_user.id,
    )

    # tg_id — тоже контакт: notifier ищет получателя по нему, и два аккаунта с
    # одним telegram означают уведомления не тому человеку. В БД стоит
    # uq_users_tg_id, но без этой проверки конфликт вернулся бы как 500.
    tg_id = patch.get("tg_id")
    if tg_id is not None and tg_id != current_user.tg_id:
        clash = (await db.execute(
            select(User.id).where(User.tg_id == tg_id, User.id != current_user.id).limit(1)
        )).first()
        if clash is not None:
            raise HTTPException(
                status_code=409,
                detail="Этот Telegram уже привязан к другому аккаунту",
            )

    for field, value in patch.items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return _me_payload(current_user, token)


@router.delete("/me", status_code=204)
async def delete_me(
    body: DeleteMeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _otp: None = Depends(require_otp("delete_user")),
):
    """Удалить аккаунт целиком — вместе с почтой, чтобы ею можно было
    зарегистрироваться заново (право на забвение, ст. 17 GDPR).

    Не путать с `DELETE /settings/security/account`: та удаляет СТУДИЮ и
    оставляет человека в продукте. Здесь наоборот — уходит человек, а студия
    остаётся, если в ней есть второй владелец.

    Что происходит со студиями. Там, где человек — единственный владелец,
    студия уходит с ним: иначе в базе остаётся рабочее пространство, войти в
    которое некому, а данные клиентов в нём продолжают лежать. Там, где
    владелец не один (или человек — админ/тренер), удаляется только членство:
    чужой бизнес не должен рушиться от того, что сотрудник закрыл свой аккаунт.

    Подписка. Пока она жива в Stripe, карта будет списываться и после удаления
    строки у нас, поэтому подписки удаляемых студий отменяются НЕМЕДЛЕННО (а не
    `cancel_at_period_end`: доигрывать оплаченный период будет некому). Stripe
    зовём ДО коммита: откажет — не удаляем ничего и отвечаем 502. Оставить
    человека с аккаунтом лучше, чем без аккаунта и с подпиской.
    """
    # Почта набирается руками: код с почты подтверждает личность, а набранный
    # адрес — намерение. Регистр и пробелы не считаем расхождением.
    if body.confirm_email.strip().lower() != current_user.email.strip().lower():
        raise HTTPException(status_code=422, detail="Почта не совпадает")

    # Студии, где этот человек — ЕДИНСТВЕННЫЙ владелец. Одним запросом, а не
    # обходом по каждой: «есть ли второй владелец» — вопрос к множеству.
    other_owners = select(StudioMember.studio_id).where(
        StudioMember.role == "owner", StudioMember.user_id != current_user.id,
    )
    doomed = list((await db.execute(
        select(StudioMember.studio_id).where(
            StudioMember.user_id == current_user.id,
            StudioMember.role == "owner",
            StudioMember.studio_id.not_in(other_owners),
        )
    )).scalars().all())

    if doomed:
        plans = (await db.execute(
            select(StudioBillingPlan).where(StudioBillingPlan.studio_id.in_(doomed))
        )).scalars().all()
        for plan in plans:
            # Те же два статуса, что и в billing/router._reconcile_subscription:
            # именно при них подписка жива в Stripe и продолжает списывать.
            if plan.stripe_subscription_id and plan.status in ("active", "past_due"):
                try:
                    await stripe_billing.cancel_subscription(plan.stripe_subscription_id)
                except Exception as exc:
                    logger.exception(
                        "Удаление аккаунта %s: подписка студии %s не отменена",
                        current_user.id, plan.studio_id,
                    )
                    raise HTTPException(status_code=502, detail={
                        "code": "billing.stripe_error",
                        "message": "Не удалось отменить подписку — аккаунт не удалён, попробуйте ещё раз",
                    }) from exc

        await db.execute(sa_delete(Studio).where(Studio.id.in_(doomed)))

    # Массовым DELETE, а не db.delete(user): у User есть relationship со
    # cascade="all, delete-orphan" на billing_invoices, и ORM-удаление снесло бы
    # счета платформы, которые обязаны пережить человека (в БД у них
    # ondelete=SET NULL — счёт остаётся, ссылка на плательщика обнуляется).
    # Остальное (членства, сессии, карты, предпочтения) уносит FK-каскад базы.
    await db.execute(sa_delete(User).where(User.id == current_user.id))
    await db.commit()


@router.get("/check-contact")
async def check_contact(
    field: Literal["email", "phone"],
    value: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Подсказка фронту (онбординг, профиль): занят ли контакт другим аккаунтом.

    Свой же контакт не в счёт — иначе владелец, создающий вторую студию
    (EPIC 7, задача 5), увидит «уже занят» на собственном телефоне.
    Барьер — guard на записи, эта ручка только гасит кнопку заранее.
    """
    return {"taken": await contact_taken(db, User, field, value, exclude_id=current_user.id)}
