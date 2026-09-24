"""Сколько стоит услуга — с поправкой на то, КТО её оказывает.

Базовая цена лежит в `services.price`, индивидуальная цена мастера — в колонке
`price` связи `user_services` (NULL = «как у услуги»). Правило перевода одного
в другое ОДНО на весь продукт и живёт здесь, как `members.is_specialist_clause`
живёт в одном месте на все экраны.

Копий заводить нельзя: цену услуги сегодня спрашивают котировка записи, Журнал,
касса, витрина мини-приложения и Каталог. Разъехавшись, они покажут клиенту одну
сумму на витрине, а спишут другую в кассе — это не расхождение интерфейсов, это
расхождение денег.

Два разных вопроса и, соответственно, две разные функции:

* «Сколько платит клиент» — `price_for`. Мастер известен, ответ — одно число.
* «Что написать, пока мастер не выбран» — `price_ranges`. Ответ — диапазон
  «от–до» по мастерам, которые эту услугу ведут.

Диапазон считается ТОЛЬКО по действующим мастерам услуги. База 300 при мастерах
по 500 и 600 даёт «от 500 до 600»: за 300 не работает никто, и показывать эту
цифру клиенту — обещать несуществующее. Услуга, которую не ведёт никто, отдаёт
свою базовую цену — показать больше нечего.
"""
from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable, Optional

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Service, StudioMember, user_services
from services.members import is_specialist_clause


@dataclass(frozen=True)
class PriceRange:
    """Во что обойдётся услуга, пока мастер не выбран."""
    min: int
    max: int

    @property
    def is_range(self) -> bool:
        """Писать «от–до» или одну сумму — решает сервер, а не каждый экран.

        Иначе один экран сравнит числа, второй забудет, и продукт начнёт писать
        «от 500 до 500».
        """
        return self.max > self.min


@dataclass(frozen=True)
class StaffPrice:
    """Цена услуги у одного мастера — и откуда она взялась."""
    price: int
    # True — сумму выставили руками. Интерфейс обязан их различать: цена,
    # унаследованная от услуги, поедет за правкой Каталога, а выставленная
    # руками — нет, и владелец должен видеть, что именно он держит.
    custom: bool


def _eligible_masters(studio_id: int):
    """Чьи цены вообще формируют диапазон: действующие мастера этой студии.

    Уволенный мастер со своей ценой 1000 не должен раздувать «до 1000» на
    витрине — записаться к нему уже нельзя. Правило «кто мастер» не своё, а
    общее продуктовое (`members.is_specialist_clause`).
    """
    return (
        select(user_services.c.service_id, user_services.c.price)
        .join(StudioMember, StudioMember.user_id == user_services.c.user_id)
        .where(
            StudioMember.studio_id == studio_id,
            StudioMember.status == "active",
            is_specialist_clause(studio_id),
        )
        .subquery()
    )


async def price_for(db: AsyncSession, service: Service, teacher_id: Optional[int]) -> int:
    """Сколько стоит `service` у мастера `teacher_id` — одно число.

    Мастер не указан, не ведёт эту услугу или ведёт без своей цены → базовая.
    Это единственный ответ на вопрос «сколько списать с клиента», и звать его
    обязаны все денежные пути.
    """
    if teacher_id is None:
        return service.price
    own = (await db.execute(
        select(user_services.c.price).where(
            user_services.c.user_id == teacher_id,
            user_services.c.service_id == service.id,
        )
    )).scalars().first()
    return service.price if own is None else int(own)


async def price_ranges(
    db: AsyncSession, studio_id: int, service_ids: Iterable[int],
) -> dict[int, PriceRange]:
    """{service_id: диапазон} — ОДНИМ запросом на весь список.

    Поштучный вызов на каждую услугу здесь запрещён осознанно: Каталог и
    витрина показывают десятки услуг разом, и обход по ним превратил бы один
    экран в десятки запросов (CLAUDE.md §5, правило 2).

    Услуги чужой студии и несуществующие id молча отсутствуют в ответе —
    вызывающий и так знает, что он спрашивал.
    """
    ids = {int(i) for i in service_ids}
    if not ids:
        return {}
    masters = _eligible_masters(studio_id)
    # LEFT JOIN + COALESCE: у услуги без мастеров подзапрос не даёт ни строки,
    # COALESCE подставляет базовую цену, и MIN = MAX = база. Отдельной ветки
    # «мастеров нет» в коде поэтому не существует — её нечем рассинхронизировать.
    rows = (await db.execute(
        select(
            Service.id,
            func.min(func.coalesce(masters.c.price, Service.price)),
            func.max(func.coalesce(masters.c.price, Service.price)),
        )
        .select_from(Service)
        .outerjoin(masters, masters.c.service_id == Service.id)
        .where(Service.studio_id == studio_id, Service.id.in_(ids))
        .group_by(Service.id, Service.price)
    )).all()
    return {sid: PriceRange(min=int(low), max=int(high)) for sid, low, high in rows}


async def price_range_for(db: AsyncSession, service: Service) -> PriceRange:
    """Диапазон ОДНОЙ услуги — когда её уже держат в руках."""
    found = await price_ranges(db, service.studio_id, [service.id])
    return found.get(service.id, PriceRange(min=service.price, max=service.price))


async def price_without_master(db: AsyncSession, service: Service) -> Optional[int]:
    """Сколько стоит услуга, когда мастер НЕ назван. None — ответ зависит от мастера.

    Все мастера услуги берут одинаково — это и есть цена, даже если она не
    совпадает с базовой: единственный мастер со своей ценой 1000 при базе 800
    значит, что за 800 эту услугу не делает никто. Взять тут базовую значило
    бы списать с клиента сумму, которой нет ни у одного мастера, — ровно так
    касса и продавала разовый визит, пока не спрашивала мастера.

    Цены у мастеров разные — одного ответа нет. Вызывающий обязан спросить
    мастера, а не подставить цену «в среднем».
    """
    span = await price_range_for(db, service)
    return None if span.is_range else span.min


@dataclass(frozen=True)
class ServiceMaster:
    """Кто оказывает услугу и во что она у него обходится."""
    user_id: int
    name: str
    price: int


async def masters_of_services(
    db: AsyncSession, studio_id: int, service_ids: Iterable[int],
) -> dict[int, list[ServiceMaster]]:
    """{service_id: мастера с их ценами} — ОДНИМ запросом на весь список.

    Тот же набор людей, по которому считается диапазон (`_eligible_masters`):
    касса обязана предлагать ровно тех, чьи цены попали в «от–до», иначе
    выбранный мастер окажется дешевле или дороже показанного.
    """
    ids = {int(i) for i in service_ids}
    if not ids:
        return {}
    rows = (await db.execute(
        select(
            user_services.c.service_id,
            StudioMember.user_id,
            StudioMember.name,
            StudioMember.last_name,
            func.coalesce(user_services.c.price, Service.price),
        )
        .select_from(user_services)
        .join(Service, Service.id == user_services.c.service_id)
        .join(StudioMember, StudioMember.user_id == user_services.c.user_id)
        .where(
            Service.studio_id == studio_id,
            user_services.c.service_id.in_(ids),
            StudioMember.studio_id == studio_id,
            StudioMember.status == "active",
            is_specialist_clause(studio_id),
        )
        .order_by(StudioMember.name, StudioMember.last_name, StudioMember.user_id)
    )).all()
    found: dict[int, list[ServiceMaster]] = defaultdict(list)
    for service_id, user_id, name, last_name, price in rows:
        found[service_id].append(ServiceMaster(
            user_id=user_id,
            name=" ".join(x for x in (name, last_name) if x),
            price=int(price),
        ))
    return dict(found)


async def prices_of_staff(
    db: AsyncSession, user_id: int, studio_id: int,
) -> dict[int, StaffPrice]:
    """{service_id: цена} по всем услугам этой студии, назначенным мастеру.

    Для его карточки и для модалки редактирования: там надо показать и сумму,
    и то, своя она или унаследованная от услуги.
    """
    rows = (await db.execute(
        select(Service.id, Service.price, user_services.c.price)
        .join(user_services, user_services.c.service_id == Service.id)
        .where(user_services.c.user_id == user_id, Service.studio_id == studio_id)
    )).all()
    return {
        sid: StaffPrice(price=base if own is None else int(own), custom=own is not None)
        for sid, base, own in rows
    }


async def apply_staff_prices(
    db: AsyncSession, user_id: int, studio_id: int, prices: dict[int, Optional[int]],
) -> None:
    """Записать индивидуальные цены мастера. Пришедший словарь — это истина.

    Зовётся ПОСЛЕ того, как сами связи «мастер ↔ услуга» уже сохранены и
    сброшены во flush: цена ложится на существующую строку `user_services`,
    своей строки у неё нет. Услуги, которой у мастера нет, запись цены просто
    не находит — лишних строк не появляется.

    Скоуп студии обязателен: человек, работающий в двух студиях, держит там
    независимые цены, и сброс одной студией не смеет обнулить другую.
    """
    studio_services = select(Service.id).where(Service.studio_id == studio_id)
    # Сначала снимаем все свои цены этой студии, потом проставляем пришедшие:
    # услуга, которой в словаре нет, обязана вернуться к базовой цене, иначе
    # снятая владельцем надбавка тихо пережила бы сохранение.
    await db.execute(
        update(user_services)
        .where(
            user_services.c.user_id == user_id,
            user_services.c.service_id.in_(studio_services),
        )
        .values(price=None)
    )
    by_value: dict[int, list[int]] = defaultdict(list)
    for service_id, value in prices.items():
        if value is not None:
            by_value[int(value)].append(int(service_id))
    for value, service_ids in by_value.items():
        await db.execute(
            update(user_services)
            .where(
                user_services.c.user_id == user_id,
                user_services.c.service_id.in_(service_ids),
                user_services.c.service_id.in_(studio_services),
            )
            .values(price=value)
        )
