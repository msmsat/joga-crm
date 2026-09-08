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
from schemas.studio.studio import reject_resource_group_combo
from services import schedule_guard

router = APIRouter()

# `bump_booking_config_version` живёт в routers/settings/general.py — тот же
# файл, что и общие настройки студии, единственный владелец правила «что
# считается изменением условий записи». Импорт ленивый (внутри функций, а не
# на верху файла): `routers.settings` — пакет с тяжёлым __init__ (тянет
# integrations -> services.assistant -> services.ai_tools -> routers.studio.
# router), и импорт на уровне модуля здесь заворачивает цикл обратно на этот
# же файл ещё до того, как он доопределится.


async def _get_service_or_404(service_id: int, studio_id: int, db: AsyncSession) -> Service:
    service = (await db.execute(
        select(Service).where(Service.id == service_id, Service.studio_id == studio_id)
    )).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    return service


def _service_read(service: Service, bookings_last_30d: int = 0) -> ServiceRead:
    return ServiceRead(
        id=service.id,
        name=service.name,
        description=service.description,
        price=service.price,
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
    )


# Поля услуги, от которых зависят условия записи — как у Studio выше
# (routers/settings/general.py), но на уровне каталога: смена цвета/описания
# услуги не должна выглядеть для клиента как смена условий записи.
_BOOKING_RELEVANT_SERVICE_FIELDS = frozenset({
    "booking_mode", "buffer_before_min", "buffer_after_min", "is_bookable",
    "terminology_profile",
})


def _assert_mode_available(booking_mode: Optional[str]) -> None:
    """Resource у услуги пока недоступен никому — см. общий гейт §HB-03."""
    if booking_mode is not None and booking_mode not in AVAILABLE_BOOKING_MODES:
        raise HTTPException(
            status_code=409,
            detail="Resource-запись пока недоступна — модуль в разработке",
        )


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
    services = (await db.execute(
        select(Service).where(Service.studio_id == ctx.studio_id).order_by(Service.name)
    )).scalars().all()
    counts = await _bookings_last_30d_by_service(ctx.studio_id, db)
    return [_service_read(s, counts.get(s.id, 0)) for s in services]


@router.get("/services/{service_id}", response_model=ServiceRead)
async def get_service(
    service_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    service = await _get_service_or_404(service_id, ctx.studio_id, db)
    counts = await _bookings_last_30d_by_service(ctx.studio_id, db)
    return _service_read(service, counts.get(service.id, 0))


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
    _assert_mode_available(data.booking_mode)
    service = Service(studio_id=ctx.studio_id, **data.model_dump())
    db.add(service)
    # Новая услуга сразу меняет каталог, доступный для записи.
    await bump_booking_config_version(db, studio)
    await db.commit()
    await db.refresh(service)
    return service


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
    _assert_mode_available(changes.get("booking_mode"))
    # Комбинация проверяется по ЭФФЕКТИВНЫМ значениям (патч частичный — новое
    # поле могло не прийти вовсе, а сочетаться с уже сохранённым).
    effective_service_type = changes.get("service_type", service.service_type)
    effective_booking_mode = changes.get("booking_mode", service.booking_mode)
    try:
        reject_resource_group_combo(effective_service_type, effective_booking_mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    touched_booking_config = any(
        getattr(service, field) != value
        for field, value in changes.items()
        if field in _BOOKING_RELEVANT_SERVICE_FIELDS
    )
    for field, value in changes.items():
        setattr(service, field, value)
    if touched_booking_config:
        await bump_booking_config_version(db, studio)
    await db.commit()
    await db.refresh(service)
    return service


@router.delete("/services/{service_id}", status_code=204)
async def delete_service(
    service_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    from routers.settings.general import bump_booking_config_version

    studio = await schedule_guard.lock_studio(db, ctx.studio_id)
    service = await _get_service_or_404(service_id, ctx.studio_id, db)
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
