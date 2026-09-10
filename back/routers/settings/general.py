from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, get_current_user, get_studio_context, require_role
from models import Studio, User
from schemas.schedule.hybrid import AVAILABLE_BOOKING_MODES, BookingCapabilities
from services import hybrid_audit, schedule_guard, terminology
from schemas.settings.general import (
    AppearanceRead,
    AppearanceUpdate,
    GeneralRead,
    GeneralReadPublic,
    GeneralUpdate,
)

router = APIRouter()

# Поля студии, от которых зависят условия записи (booking_config_version
# растёт при их изменении — HB-16 сверяет версию, чтобы не показать
# устаревшие условия из кэша). Логотип, контакты и адрес сюда НЕ входят —
# задача прямо требует не путать смену витрины со сменой условий записи.
_BOOKING_RELEVANT_STUDIO_FIELDS = frozenset({
    "booking_mode", "terminology_profile", "strict_schedule_enabled",
    "tz_iana", "timezone", "currency", "journal_time_step",
})


async def _get_studio(studio_id: int, db: AsyncSession) -> Studio:
    studio = await db.get(Studio, studio_id)
    if studio is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")
    return studio


def _capabilities(studio: Studio) -> BookingCapabilities:
    return BookingCapabilities(
        booking_mode=studio.booking_mode,
        terminology_profile=studio.terminology_profile,
        booking_config_version=studio.booking_config_version,
        strict_schedule_enabled=studio.strict_schedule_enabled,
    )


async def bump_booking_config_version(db: AsyncSession, studio: Studio) -> None:
    """Растёт при любом изменении условий записи — студии или каталога.

    Атомарный SQL-инкремент, а не `studio.booking_config_version += 1`:
    два одновременных сохранения (владелец правит студию, второй — услугу)
    не должны потерять один из инкрементов через read-modify-write. НЕ
    коммитит — вызывающий уже в своей транзакции сохранения.
    """
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(Studio).where(Studio.id == studio.id)
        .values(booking_config_version=Studio.booking_config_version + 1)
    )


@router.get("/general", response_model=None)
async def get_general_settings(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
    locale: str | None = None,
):
    studio = await _get_studio(ctx.studio_id, db)
    capabilities = _capabilities(studio)
    if ctx.role == "owner":
        return GeneralRead.model_validate(studio).model_copy(
            update={"booking_capabilities": capabilities, "terminology": terminology.configuration(studio, locale)})
    # Не-owner (admin/trainer): без контактов и адреса студии (ТЗ эпика 2, задача 1).
    return GeneralReadPublic.model_validate(studio).model_copy(
        update={"booking_capabilities": capabilities, "terminology": terminology.configuration(studio, locale)})


@router.patch("/general", response_model=GeneralRead)
async def update_general_settings(
    body: GeneralUpdate,
    background: BackgroundTasks,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
    locale: str | None = None,
):
    # HB-06: замок студии — до любой правки конфигурации записи (§6.2).
    studio = await schedule_guard.lock_studio(db, ctx.studio_id)
    was_lang = studio.language
    changes = body.model_dump(exclude_unset=True)
    if "booking_mode" in changes and changes["booking_mode"] not in AVAILABLE_BOOKING_MODES:
        raise HTTPException(
            status_code=409,
            detail="Этот режим записи недоступен в текущей версии",
        )
    touched_booking_config = any(
        field in changes and getattr(studio, field) != value
        for field, value in changes.items()
        if field in _BOOKING_RELEVANT_STUDIO_FIELDS
    )
    for field, value in changes.items():
        setattr(studio, field, value)
    if {"tz_iana", "timezone"} & changes.keys():
        await db.flush()
        await schedule_guard.assert_studio_assignments_valid(db, studio)
    # HB-24 п.3: проверки включения повторяются здесь, под уже взятым замком
    # студии, а не по отчёту, снятому владельцем минуту назад.
    if {"booking_mode", "strict_schedule_enabled"} & changes.keys():
        await db.flush()
        await hybrid_audit.assert_can_activate(db, studio, changes)
    if touched_booking_config:
        await bump_booking_config_version(db, studio)
    await db.commit()
    await db.refresh(studio)
    if studio.language != was_lang:
        # Шаблоны WhatsApp заведены на WABA на языке студии, и на новом языке их
        # там просто нет — Meta откажет, а уведомления замолчат. Досоздаём фоном:
        # это 40 запросов к Graph, в ответ на сохранение настроек они не влезают.
        from services.whatsapp import sync_templates_on_connect

        background.add_task(sync_templates_on_connect, ctx.studio_id)
    return GeneralRead.model_validate(studio).model_copy(
        update={"booking_capabilities": _capabilities(studio), "terminology": terminology.configuration(studio, locale)})


@router.get("/appearance", response_model=AppearanceRead)
async def get_appearance(
    user: User = Depends(get_current_user),
):
    return user


@router.patch("/appearance", response_model=AppearanceRead)
async def update_appearance(
    body: AppearanceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user
