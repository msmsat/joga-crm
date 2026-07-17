import os
from dataclasses import dataclass
from datetime import date, datetime
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import jwt, JWTError

from database import get_db
from models import StudioBillingPlan, StudioMember, User

SECRET_KEY = os.getenv("SECRET_KEY", "velora_super_secret_key_2026")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Недействительный токен")
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    user = (await db.execute(
        select(User).where(User.email == email)
    )).scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@dataclass
class StudioContext:
    user: User
    studio_id: int
    role: str


async def get_studio_context(
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StudioContext:
    """Кто вошёл, его активная студия и роль. Одна строка на любой роутер."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    studio_id = payload.get("studio_id")
    role = payload.get("role")

    # Ловушка: у мультистудийных пользователей токен НЕ содержит studio_id/role.
    # Достаём из БД. Если членство ровно одно — берём его; если несколько,
    # активную студию выбрать нельзя без подсказки в токене → просим выбрать.
    if not studio_id or not role:
        memberships = (await db.execute(
            select(StudioMember).where(StudioMember.user_id == user.id)
        )).scalars().all()
        if not memberships:
            raise HTTPException(status_code=403, detail="Пользователь не состоит ни в одной студии")
        if len(memberships) > 1:
            raise HTTPException(status_code=400, detail="Не выбрана активная студия")
        m = memberships[0]
        studio_id, role = m.studio_id, m.role

    # Онлайн = «сегодня заходил в CRM» (задача 12): одна запись в БД на пользователя в день.
    today = date.today()
    if user.last_online_at != today:
        user.last_online_at = today
        await db.commit()

    return StudioContext(user=user, studio_id=int(studio_id), role=role)


def require_role(*roles: str):
    """Охранник: пускает только перечисленные роли, иначе 403.

    Вешается на эндпоинт: `ctx: StudioContext = Depends(require_role("owner"))`.
    """
    async def guard(ctx: StudioContext = Depends(get_studio_context)) -> StudioContext:
        if ctx.role not in roles:
            raise HTTPException(status_code=403, detail="Нет доступа")
        return ctx
    return guard


async def get_scoped_lesson(lesson_id: int, ctx: StudioContext, db: AsyncSession):
    """Занятие студии с ролевым скоупом. Owner/admin — любое занятие своей студии;
    тренер — только своё (ТЗ 2.3). 404 если занятия нет в студии, 403 если тренер
    трогает чужое. Образец проверки teacher_id — staff/schedule.py cancel_lesson.
    """
    from models import Lesson  # локальный импорт: избегаем цикла на уровне модуля

    lesson = (await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    if ctx.role == "trainer" and lesson.teacher_id != ctx.user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к чужому занятию")
    return lesson


async def require_active_subscription(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
) -> StudioContext:
    """Глобальный гейт (задача 8b): пускает в разделы данных только с активной подпиской.

    Истина — БД (StudioBillingPlan), НЕ JWT. План отсутствует (до онбординга) или
    истёк (expires_at < now) → 402 subscription_expired. Вешается router-level на
    все разделы данных; НЕ на /auth, /billing, /public, вебхук — иначе не войти/не оплатить.
    """
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()

    expired = plan is None or (plan.expires_at is not None and plan.expires_at < datetime.utcnow())
    # ponytail: авто-recurring при истёкшем триале (пункт 4) — после задачи 7 (renew ещё нет);
    # апгрейд: если plan.auto_renewal и есть rectoken → инициировать recurring один раз с пометкой.
    if expired:
        raise HTTPException(status_code=402, detail={
            "code": "subscription_expired",
            "message": "Подписка неактивна — оформите тариф, чтобы продолжить.",
        })
    return ctx
