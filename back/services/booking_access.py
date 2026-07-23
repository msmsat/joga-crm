"""Единый гейт доступа к записи по абонементу (CL-6, задача 6.1).

Обе точки записи клиента на занятие (Журнал — reservations.py, панель клиента —
profiles.py) должны проверять одно и то же право, поэтому проверка живёт здесь
и вызывается из обеих. "Разовое" (оплаченное тут же через кассу, CL-6.9) этот
гейт не проходит — его право есть сам факт оплаты.
"""
from typing import Optional

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from models import ClientSubscription, Lesson, SubscriptionPackage


async def find_eligible_subscription(
    db: AsyncSession, client_id: int, lesson: Lesson
) -> Optional[ClientSubscription]:
    """Активный незамороженный абонемент клиента с остатком, подходящий под
    тип занятия lesson. Возвращает первый подходящий или None."""
    subs = (await db.execute(
        select(ClientSubscription).where(
            ClientSubscription.client_id == client_id,
            ClientSubscription.status == "active",
            ClientSubscription.is_frozen == False,
            ClientSubscription.used_classes < ClientSubscription.total_classes,
        )
    )).scalars().all()
    if not subs:
        return None

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
    sub = await find_eligible_subscription(db, client_id, lesson)
    if sub is not None:
        return sub

    has_any_subscription = (await db.execute(
        select(ClientSubscription.id).where(
            ClientSubscription.client_id == client_id,
            ClientSubscription.status == "active",
            ClientSubscription.is_frozen == False,
            ClientSubscription.used_classes < ClientSubscription.total_classes,
        )
    )).scalar_one_or_none()
    if has_any_subscription is not None:
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
    sub = await find_eligible_subscription(db, client_id, lesson)
    return sub is not None
