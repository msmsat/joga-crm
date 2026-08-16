"""Единый гейт доступа к записи по абонементу (CL-6, задача 6.1).

Обе точки записи клиента на занятие (Журнал — reservations.py, панель клиента —
profiles.py) должны проверять одно и то же право, поэтому проверка живёт здесь
и вызывается из обеих. "Разовое" (оплаченное тут же через кассу, CL-6.9) этот
гейт не проходит — его право есть сам факт оплаты.
"""
from datetime import date
from typing import Optional

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from models import ClientSubscription, Lesson, SubscriptionPackage


async def find_eligible_subscription(
    db: AsyncSession, client_id: int, lesson: Lesson
) -> Optional[ClientSubscription]:
    """Незамороженный абонемент клиента с остатком, подходящий под тип занятия
    lesson. Возвращает первый подходящий или None.

    Порядок: сначала идущие (status="active") по expires_at — с абонемента
    списывается занятие при записи (services/subscription_charge.py), и тратить
    надо тот, что сгорит раньше. Потом очередь (status="pending") по порядку
    покупки: она уже оплачена, поэтому записываться по ней можно, но свой срок
    такой абонемент начнёт только когда занятие реально пройдёт
    (subscription_charge.activate_pending_after_visit).
    """
    subs = (await db.execute(
        select(ClientSubscription).where(
            ClientSubscription.client_id == client_id,
            ClientSubscription.status.in_(("active", "pending")),
            ClientSubscription.is_frozen == False,
            ClientSubscription.used_classes < ClientSubscription.total_classes,
        )
    )).scalars().all()
    # Идущий абонемент годится, только если доживает до занятия: сгорающий 20-го
    # не даёт записаться на 25-е, а купленный поверх, до 30-го, — даёт. Дата
    # включительно, как везде в проекте (expires_at >= today). Очередь под это
    # правило не попадает: её срок ещё не начался и стартует с реального визита.
    lesson_date = lesson.start_time.date()
    subs = [s for s in subs if s.status == "pending" or s.expires_at >= lesson_date]
    if not subs:
        return None

    # date.max для очереди: её провизорный expires_at сравнивать не с чем.
    subs.sort(key=lambda s: (
        s.status != "active",
        s.expires_at if s.status == "active" else date.max,
        s.id,
    ))

    package_ids = {sub.package_id for sub in subs if sub.package_id is not None}
    packages_by_id = {}
    if package_ids:
        packages = (await db.execute(
            select(SubscriptionPackage).where(SubscriptionPackage.id.in_(package_ids))
        )).scalars().all()
        packages_by_id = {pkg.id: pkg for pkg in packages}

    for sub in subs:
        # package_id is null (старые абонементы до V5-4) — считаем универсальным,
        # чтобы не ломать их ретроактивно.
        if sub.package_id is None:
            return sub
        package = packages_by_id.get(sub.package_id)
        # Пакет мог быть удалён — по той же причине не ломаем старую запись.
        if package is None:
            return sub
        # service_ids is null/пуст = универсальный пакет, подходит под любое занятие.
        if not package.service_ids or lesson.service_id in package.service_ids:
            return sub
    return None


async def assert_can_book(
    db: AsyncSession, client_id: int, lesson: Lesson
) -> ClientSubscription:
    """Бросает HTTPException, если клиента нельзя записать на lesson по
    абонементу. Возвращает подходящий ClientSubscription при успехе."""
    if lesson.status == "cancelled":
        raise HTTPException(status_code=400, detail="Занятие отменено")

    sub = await find_eligible_subscription(db, client_id, lesson)
    if sub is not None:
        return sub

    rows = (await db.execute(
        select(ClientSubscription.expires_at, ClientSubscription.status).where(
            ClientSubscription.client_id == client_id,
            ClientSubscription.status.in_(("active", "pending")),
            ClientSubscription.is_frozen == False,
            ClientSubscription.used_classes < ClientSubscription.total_classes,
        )
    )).all()
    if rows:
        # Все абонементы с остатком сгорают раньше занятия → дело в сроке, а не в
        # типе: иначе клиент получал бы «не подходит для этого занятия» и искал
        # причину в услуге.
        lesson_date = lesson.start_time.date()
        if all(status == "active" and expires_at < lesson_date for expires_at, status in rows):
            raise HTTPException(
                status_code=400,
                detail="Абонемент клиента истекает раньше даты занятия",
            )
        raise HTTPException(
            status_code=400,
            detail="Абонемент клиента не подходит для этого занятия",
        )
    raise HTTPException(
        status_code=403,
        detail="У клиента нет активного абонемента или разового занятия для записи",
    )


async def can_book(db: AsyncSession, client_id: int, lesson: Lesson) -> bool:
    """Булева версия для массовых проверок (CL-6.4: eligible-clients) — без
    исключений в цикле."""
    if lesson.status == "cancelled":
        return False
    sub = await find_eligible_subscription(db, client_id, lesson)
    return sub is not None
