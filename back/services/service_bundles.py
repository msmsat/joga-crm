"""Комплексы услуг — «Стрижка + борода» за один визит и одной записью.

Комплекс — это ОБЫЧНАЯ услуга (`services`): своя цена, длительность, мастера,
механика записи. Поэтому котировка, Журнал, касса, абонементы и отчёты работают
с ним без единой правки — для них это просто ещё одна услуга. Нового здесь
только состав (`service_bundle_items`) и три правила вокруг него:

* Что может быть частью. Индивидуальная услуга этой студии и не другой
  комплекс. Групповая не годится: у неё одно время на всю группу, а комплекс —
  подряд для одного клиента. Вложенные комплексы запрещены, чтобы состав всегда
  читался одним списком.
* Кто делает комплекс. Весь комплекс ведёт ОДИН мастер (так он и бронируется —
  одним интервалом одного специалиста), значит годится тот, кто делает все
  части. Таких мастеров назначаем сами при сохранении состава; снимать никого
  не снимаем — это решение владельца в карточке сотрудника.
* Сколько клиент экономит. «По отдельности» — сумма САМЫХ низких цен частей:
  дешевле по отдельности не выйдет ни у одного мастера. Зачёркнутую сумму
  показываем, только если она выше самой высокой цены комплекса, — иначе
  обещали бы выгоду, которой у кого-то из мастеров нет.
"""
from collections import defaultdict
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import and_, delete, func, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Service, ServiceBundleItem, StudioMember, user_services
from services.service_pricing import PriceRange
from services.members import is_specialist_clause

MIN_PARTS = 2
MAX_PARTS = 10


def _error(status: int, code: str, message: str) -> HTTPException:
    # Код переводит фронт (common:errors.catalog.*), message — запасной текст
    # для ассистента и старых клиентов.
    return HTTPException(status_code=status, detail={"code": f"catalog.{code}", "message": message})


def can_be_part(service_type: Optional[str], booking_mode: Optional[str]) -> bool:
    """Индивидуальная услуга: формат `individual` или механика «выбор времени»
    (она индивидуальна по построению — вместимость 1)."""
    return service_type == "individual" or booking_mode == "resource"


def assert_is_bundle(current_parts: list[int]) -> None:
    """Состав правится только у комплекса. Обычную услугу комплексом не делаем:
    её записи и выручка относятся к одной процедуре, а не к набору."""
    if not current_parts:
        raise _error(422, "not_a_bundle",
                     "Обычную услугу нельзя превратить в комплекс — создайте новый комплекс")


async def compositions(db: AsyncSession, studio_id: int) -> dict[int, list[int]]:
    """{id комплекса: id частей по порядку} по всей студии — одним запросом."""
    rows = (await db.execute(
        select(ServiceBundleItem.bundle_id, ServiceBundleItem.service_id)
        .join(Service, Service.id == ServiceBundleItem.bundle_id)
        .where(Service.studio_id == studio_id)
        .order_by(ServiceBundleItem.bundle_id, ServiceBundleItem.position)
    )).all()
    found: dict[int, list[int]] = defaultdict(list)
    for bundle_id, part_id in rows:
        found[bundle_id].append(part_id)
    return dict(found)


async def parts_of(db: AsyncSession, bundle_id: int) -> list[int]:
    """Состав одного комплекса. Пустой список — это обычная услуга."""
    return list((await db.execute(
        select(ServiceBundleItem.service_id)
        .where(ServiceBundleItem.bundle_id == bundle_id)
        .order_by(ServiceBundleItem.position)
    )).scalars().all())


async def bundles_containing(db: AsyncSession, service_id: int) -> list[int]:
    """Комплексы, в которые входит услуга."""
    return list((await db.execute(
        select(ServiceBundleItem.bundle_id).where(ServiceBundleItem.service_id == service_id)
    )).scalars().all())


async def assert_not_a_part(db: AsyncSession, service_id: int) -> None:
    """Услугу, из которой собран комплекс, нельзя удалить или сделать групповой:
    комплекс остался бы с дырой в составе. Сначала — убрать её из комплекса."""
    if await bundles_containing(db, service_id):
        raise _error(409, "service_in_bundle",
                     "Услуга входит в комплекс — сначала уберите её из состава")


async def validate_parts(
    db: AsyncSession, studio_id: int, part_ids: Iterable[int], bundle_id: Optional[int] = None,
) -> list[int]:
    """Проверить состав и вернуть его в порядке, в котором части делают."""
    ids = [int(i) for i in part_ids]
    if not MIN_PARTS <= len(ids) <= MAX_PARTS:
        raise _error(422, "bundle_size", f"В комплексе должно быть от {MIN_PARTS} до {MAX_PARTS} услуг")
    if len(set(ids)) != len(ids) or bundle_id in ids:
        raise _error(422, "bundle_part_invalid", "Каждая услуга входит в комплекс один раз")
    # Скоуп студии в самом запросе: чужая услуга не находится, и это та же
    # ошибка, что «не годится», — существование чужого id не подтверждаем.
    parts = (await db.execute(
        select(Service).where(Service.studio_id == studio_id, Service.id.in_(ids))
    )).scalars().all()
    nested = (await db.execute(
        select(ServiceBundleItem.bundle_id).where(ServiceBundleItem.bundle_id.in_(ids)).limit(1)
    )).first()
    if (len(parts) != len(ids) or nested is not None
            or not all(can_be_part(p.service_type, p.booking_mode) for p in parts)):
        raise _error(422, "bundle_part_invalid",
                     "В комплекс входят только индивидуальные услуги этой студии, не другие комплексы")
    return ids


async def set_parts(db: AsyncSession, bundle_id: int, part_ids: list[int]) -> None:
    """Состав целиком заменяется пришедшим — пришедший список и есть истина."""
    await db.execute(delete(ServiceBundleItem).where(ServiceBundleItem.bundle_id == bundle_id))
    db.add_all([
        ServiceBundleItem(bundle_id=bundle_id, service_id=part_id, position=position)
        for position, part_id in enumerate(part_ids)
    ])


async def assign_masters(db: AsyncSession, studio_id: int, bundle_id: int, part_ids: list[int]) -> None:
    """Назначить комплекс мастерам студии, которые делают ВСЕ его части.

    Добавляет подходящих действующих мастеров при создании и смене состава.
    Уже назначенных мастеров и их индивидуальные цены сохраняет: назначения
    комплексной услуги владелец также управляет в карточке сотрудника.
    Цену не пишем — NULL значит
    «как у комплекса» (services/service_pricing.py).
    """
    already = select(user_services.c.user_id).where(user_services.c.service_id == bundle_id)
    user_ids = (await db.execute(
        select(user_services.c.user_id)
        .join(StudioMember, and_(StudioMember.user_id == user_services.c.user_id,
                                 StudioMember.studio_id == studio_id))
        .where(user_services.c.service_id.in_(part_ids), user_services.c.user_id.not_in(already),
               StudioMember.status == "active", is_specialist_clause(studio_id))
        .group_by(user_services.c.user_id)
        .having(func.count(func.distinct(user_services.c.service_id)) == len(part_ids))
    )).scalars().all()
    if user_ids:
        await db.execute(insert(user_services),
                         [{"user_id": u, "service_id": bundle_id, "price": None} for u in user_ids])


def full_price(part_ids: Iterable[int], spans: dict[int, PriceRange], bundle: PriceRange) -> Optional[int]:
    """Зачёркнутая сумма «по отдельности» — или None, если выгоды нет."""
    total = sum(spans[p].min for p in part_ids if p in spans)
    return total if total > bundle.max else None
