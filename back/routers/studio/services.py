from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Service, Lesson, Reservation, Studio
from schemas.schedule.hybrid import AVAILABLE_BOOKING_MODES
from schemas.studio import ServiceRead, ServiceCreate, ServiceUpdate, ServiceWeekSlot
from schemas.studio.studio import ServiceBundlePartRead, ServiceMasterRead, ServiceRefRead
from schemas.studio.studio import reject_resource_group_combo
from services import schedule_guard, service_bundles, service_pricing

router = APIRouter()

# `bump_booking_config_version` живёт в routers/settings/general.py — тот же
# файл, что и общие настройки студии, единственный владелец правила «что
# считается изменением условий записи». Импорт ленивый (внутри функций, а не
# на верху файла): `routers.settings` — пакет с тяжёлым __init__ (тянет
# integrations -> services.assistant -> services.ai_tools -> routers.studio.
# router), и импорт на уровне модуля здесь заворачивает цикл обратно на этот
# же файл ещё до того, как он доопределится.


async def _normalize_category(category: Optional[str], studio_id: int, db: AsyncSession) -> Optional[str]:
    """Привести категорию к написанию, которое студия уже использует.

    Категории — свободные строки самой студии (справочника нет, набор
    складывается из услуг), поэтому «Стрижка» и «стрижка» разошлись бы на две
    группы Каталога и два разреза Отчётов. Форма это уже не даёт сделать —
    селект подставляет существующую строку, — но ассистент и импорт пишут
    напрямую, а правило должно быть одно на всех."""
    if category is None:
        return None
    cleaned = category.strip()
    if not cleaned:
        return None
    known = (await db.execute(
        select(Service.category).where(
            Service.studio_id == studio_id, Service.category.is_not(None)
        ).distinct()
    )).scalars().all()
    for existing in known:
        if existing.strip().casefold() == cleaned.casefold():
            return existing
    return cleaned


async def _get_service_or_404(service_id: int, studio_id: int, db: AsyncSession) -> Service:
    service = (await db.execute(
        select(Service).where(Service.id == service_id, Service.studio_id == studio_id)
    )).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    return service


def _service_read(
    service: Service,
    bookings_last_30d: int = 0,
    price_range: "service_pricing.PriceRange | None" = None,
    masters: "list[service_pricing.ServiceMaster] | None" = None,
    bundle_items: "list[ServiceBundlePartRead] | None" = None,
    bundle_full_price: Optional[int] = None,
    in_bundles: "list[ServiceRefRead] | None" = None,
) -> ServiceRead:
    # Диапазон не передали (создание и правка услуги — там мастеров ещё не
    # спрашивали) → одна цена, равная базовой. Отдавать 0 нельзя: фронт покажет
    # «от 0».
    span = price_range or service_pricing.PriceRange(min=service.price, max=service.price)
    return ServiceRead(
        id=service.id,
        name=service.name,
        description=service.description,
        price=service.price,
        price_min=span.min,
        price_max=span.max,
        masters=[
            ServiceMasterRead(user_id=m.user_id, name=m.name, price=m.price)
            for m in (masters or [])
        ],
        duration_min=service.duration_min,
        category=service.category,
        service_type=service.service_type,
        color=service.color,
        max_clients=service.max_clients,
        bookings_count=service.bookings_count,
        revenue_total=service.revenue_total,
        bookings_last_30d=bookings_last_30d,
        booking_mode=service.booking_mode,
        buffer_before_min=service.buffer_before_min,
        buffer_after_min=service.buffer_after_min,
        is_bookable=service.is_bookable,
        terminology_profile=service.terminology_profile,
        bundle_items=bundle_items or [],
        bundle_full_price=bundle_full_price,
        in_bundles=in_bundles or [],
    )


async def _read_all(studio_id: int, db: AsyncSession) -> dict[int, ServiceRead]:
    """Каталог услуг студии целиком, по названию — {id: карточка}.

    Одна услуга читается тем же путём, что и весь список: у комплекса в
    карточке его части, у части — комплексы, куда она входит, и для этого всё
    равно нужен каталог. Услуг у студии десятки, а два пути сборки одной и той
    же карточки разошлись бы на первой правке. Запросов фиксированное число,
    сколько бы услуг ни было (CLAUDE.md §5, правило 2).
    """
    services = (await db.execute(
        select(Service).where(Service.studio_id == studio_id).order_by(Service.name)
    )).scalars().all()
    counts = await _bookings_last_30d_by_service(studio_id, db)
    ids = [s.id for s in services]
    spans = await service_pricing.price_ranges(db, studio_id, ids)
    masters = await service_pricing.masters_of_services(db, studio_id, ids)
    compositions = await service_bundles.compositions(db, studio_id)

    by_id = {s.id: s for s in services}

    def span(sid: int) -> service_pricing.PriceRange:
        # Без диапазона — базовая цена, не 0: иначе экран напишет «от 0».
        return spans.get(sid) or service_pricing.PriceRange(min=by_id[sid].price, max=by_id[sid].price)

    containing: dict[int, list[ServiceRefRead]] = defaultdict(list)
    for bundle_id, part_ids in compositions.items():
        for part_id in part_ids:
            containing[part_id].append(ServiceRefRead(id=bundle_id, name=by_id[bundle_id].name))

    def parts(service: Service) -> list[ServiceBundlePartRead]:
        return [
            ServiceBundlePartRead(
                service_id=p, name=by_id[p].name, duration_min=by_id[p].duration_min,
                price_min=span(p).min, price_max=span(p).max, color=by_id[p].color,
            )
            for p in compositions.get(service.id, [])
        ]

    return {
        s.id: _service_read(
            s, counts.get(s.id, 0), span(s.id), masters.get(s.id),
            bundle_items=parts(s),
            bundle_full_price=(
                service_bundles.full_price(compositions[s.id], spans, span(s.id))
                if s.id in compositions else None
            ),
            in_bundles=containing.get(s.id),
        )
        for s in services
    }


# Поля услуги, от которых зависят условия записи — как у Studio выше
# (routers/settings/general.py), но на уровне каталога: смена цвета/описания
# услуги не должна выглядеть для клиента как смена условий записи.
_BOOKING_RELEVANT_SERVICE_FIELDS = frozenset({
    "booking_mode", "buffer_before_min", "buffer_after_min", "is_bookable",
    "terminology_profile", "price", "duration_min",
})


def _assert_mode_available(booking_mode: Optional[str], studio) -> None:
    """Общий гейт §HB-03/HB-24 плюс условие включения из §6.6.

    Resource-услуга без строгого расписания бессмысленна и опасна: её
    интервал никто не защищает от двойной продажи. Порядок раскатки —
    сначала strict у студии (аудит наследия), потом resource-каталог.
    """
    if booking_mode is not None and booking_mode not in AVAILABLE_BOOKING_MODES:
        raise HTTPException(
            status_code=409,
            detail="Этот режим записи недоступен в текущей версии",
        )
    if booking_mode == "resource" and not studio.strict_schedule_enabled:
        raise HTTPException(status_code=409, detail={
            "code": "STRICT_SCHEDULE_REQUIRED",
            "message": "Сначала включите строгое расписание студии",
            "params": {}})


async def _bookings_last_30d_by_service(studio_id: int, db: AsyncSession) -> dict[int, int]:
    # Честные «записи за 30 дней»: реальные брони (не отменённые) на занятиях услуги
    # за последние 30 дней — заменяет магическую bookings_count/6.
    since = datetime.now() - timedelta(days=30)
    rows = (await db.execute(
        select(Lesson.service_id, func.count(Reservation.id))
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(
            Lesson.studio_id == studio_id,
            Lesson.service_id.is_not(None),
            Lesson.start_time >= since,
            Reservation.status != "cancelled",
        )
        .group_by(Lesson.service_id)
    )).all()
    return {service_id: count for service_id, count in rows}


@router.get("/services", response_model=list[ServiceRead])
async def list_services(
    # Каталог — владельцу (ТЗ 2.6), но список услуг нужен и форме занятия в
    # Журнале, а расписанием по ТЗ 2.3 заведует ещё и администратор: без этого
    # у него в «Создать занятие» пустой селект услуг и 403 в консоли.
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    return list((await _read_all(ctx.studio_id, db)).values())


@router.get("/services/{service_id}", response_model=ServiceRead)
async def get_service(
    service_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    service = await _get_service_or_404(service_id, ctx.studio_id, db)
    return (await _read_all(ctx.studio_id, db))[service.id]


@router.post("/services", response_model=ServiceRead, status_code=201)
async def create_service(
    data: ServiceCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    from routers.settings.general import bump_booking_config_version

    # HB-06: замок студии — до правки каталога (§6.2 п.4: изменение услуги
    # выполняется под тем же замком, что confirm брони).
    studio = await schedule_guard.lock_studio(db, ctx.studio_id)
    _assert_mode_available(data.booking_mode, studio)
    fields = data.model_dump()
    parts = fields.pop("bundle_service_ids", None)
    fields["category"] = await _normalize_category(fields.get("category"), ctx.studio_id, db)
    if parts is not None:
        parts = await service_bundles.validate_parts(db, ctx.studio_id, parts)
        # Комплекс делают одному клиенту подряд — групповым он не бывает.
        if fields.get("service_type") == "group":
            raise HTTPException(status_code=422, detail="Комплекс не может быть групповым")
        fields["service_type"] = "individual"
        fields["max_clients"] = 1
    service = Service(studio_id=ctx.studio_id, **fields)
    db.add(service)
    await db.flush()
    service_id = service.id
    if parts is not None:
        await service_bundles.set_parts(db, service_id, parts)
        await service_bundles.assign_masters(db, ctx.studio_id, service_id, parts)
    # Новая услуга сразу меняет каталог, доступный для записи.
    await bump_booking_config_version(db, studio)
    await db.commit()
    return (await _read_all(ctx.studio_id, db))[service_id]


@router.patch("/services/{service_id}", response_model=ServiceRead)
async def update_service(
    service_id: int,
    data: ServiceUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    from routers.settings.general import bump_booking_config_version

    studio = await schedule_guard.lock_studio(db, ctx.studio_id)
    service = await _get_service_or_404(service_id, ctx.studio_id, db)
    changes = data.model_dump(exclude_unset=True)
    new_parts = changes.pop("bundle_service_ids", None)
    if "category" in changes:
        changes["category"] = await _normalize_category(changes["category"], ctx.studio_id, db)
    _assert_mode_available(changes.get("booking_mode"), studio)
    # Комбинация проверяется по ЭФФЕКТИВНЫМ значениям (патч частичный — новое
    # поле могло не прийти вовсе, а сочетаться с уже сохранённым).
    effective_service_type = changes.get("service_type", service.service_type)
    effective_booking_mode = changes.get("booking_mode", service.booking_mode)
    if effective_booking_mode != service.booking_mode:
        await schedule_guard.assert_service_mode_changeable(db, studio, service)
    try:
        reject_resource_group_combo(effective_service_type, effective_booking_mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    effective_duration = changes.get("duration_min", service.duration_min)
    if effective_booking_mode == "resource" and (effective_duration is None or not 1 <= effective_duration <= 1440):
        raise HTTPException(status_code=422, detail="Длительность должна быть от 1 до 1440 минут")

    current_parts = await service_bundles.parts_of(db, service.id)
    if new_parts is not None:
        service_bundles.assert_is_bundle(current_parts)
        new_parts = await service_bundles.validate_parts(db, ctx.studio_id, new_parts, bundle_id=service.id)
    if current_parts and effective_service_type == "group":
        raise HTTPException(status_code=422, detail="Комплекс не может быть групповым")
    if current_parts:
        changes["service_type"] = "individual"
        changes["max_clients"] = 1
    # Часть комплекса обязана остаться индивидуальной — иначе комплекс
    # собран из того, что одному клиенту подряд не сделать.
    if not service_bundles.can_be_part(effective_service_type, effective_booking_mode):
        await service_bundles.assert_not_a_part(db, service.id)

    parts_changed = new_parts is not None and new_parts != current_parts
    touched_booking_config = parts_changed or any(
        getattr(service, field) != value
        for field, value in changes.items()
        if field in _BOOKING_RELEVANT_SERVICE_FIELDS
    )
    for field, value in changes.items():
        setattr(service, field, value)
    if parts_changed:
        await service_bundles.set_parts(db, service.id, new_parts)
        await service_bundles.assign_masters(db, ctx.studio_id, service.id, new_parts)
    if touched_booking_config:
        await bump_booking_config_version(db, studio)
    await db.commit()
    return (await _read_all(ctx.studio_id, db))[service_id]


@router.delete("/services/{service_id}", status_code=204)
async def delete_service(
    service_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    from routers.settings.general import bump_booking_config_version

    studio = await schedule_guard.lock_studio(db, ctx.studio_id)
    service = await _get_service_or_404(service_id, ctx.studio_id, db)
    # Часть комплекса — 409 с понятной причиной, а не нарушение внешнего ключа.
    await service_bundles.assert_not_a_part(db, service_id)
    # Resource-история держит услугу обязательной ссылкой (§6.1) — 409 вместо
    # нарушения CHECK при ON DELETE SET NULL.
    await schedule_guard.assert_service_removable(db, studio, service_id)
    await db.delete(service)
    # Удалённая услуга больше не участвует в каталоге записи.
    await bump_booking_config_version(db, studio)
    await db.commit()


@router.get("/services/{service_id}/week", response_model=list[ServiceWeekSlot])
async def get_service_week(
    service_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Реальные занятия услуги на текущей неделе — для честной сетки «Расписание» в Каталоге."""
    await _get_service_or_404(service_id, ctx.studio_id, db)

    today = datetime.now()
    week_start = (today - timedelta(days=today.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)

    lessons = (await db.execute(
        select(Lesson.start_time).where(
            Lesson.service_id == service_id,
            Lesson.studio_id == ctx.studio_id,
            Lesson.status != "cancelled",
            Lesson.start_time >= week_start,
            Lesson.start_time < week_end,
        )
    )).scalars().all()

    slots = {(st.weekday(), st.hour) for st in lessons}
    return [ServiceWeekSlot(day_of_week=d, hour=h) for d, h in slots]
