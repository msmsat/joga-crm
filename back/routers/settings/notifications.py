from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, get_studio_context, StudioContext
from models import StudioNotificationSettings, NotificationEventToggle, UserNotificationPreference
from services.notification_catalog import CATALOG, events_for_role
from services.notification_resolver import connected_channels, studio_channels
from services.notifier import NOTIFY_CHANNELS
from schemas.settings.notifications import (
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    EventToggle,
    EventToggleBulkUpdate,
    ChannelInfo,
    MatrixRow,
    MatrixRead,
    UserPrefRow,
    UserPrefRead,
    UserPrefUpdate,
)

router = APIRouter()


async def _get_or_create_settings(studio_id: int, db: AsyncSession) -> StudioNotificationSettings:
    settings = (await db.execute(
        select(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == studio_id)
    )).scalar_one_or_none()
    if settings is None:
        settings = StudioNotificationSettings(studio_id=studio_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get(
    "/notifications",
    response_model=NotificationSettingsRead,
    response_model_by_alias=False,  # отдаём telegram, а не telegram_notifications
)
async def get_notification_settings(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create_settings(ctx.studio_id, db)


@router.patch(
    "/notifications",
    response_model=NotificationSettingsRead,
    response_model_by_alias=False,  # ответ PATCH тоже в коротких ключах
)
async def update_notification_settings(
    body: NotificationSettingsUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    settings = await _get_or_create_settings(ctx.studio_id, db)
    # exclude_unset — трогаем только присланные поля; by_alias — колонки модели.
    for field, value in body.model_dump(exclude_unset=True, by_alias=True).items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)
    return settings


# ─── EPIC 3, Задача 3: матрица «событие × канал» ─────────────────────────────
async def _matrix_row(db: AsyncSession, studio_id: int, event_id: str, spec) -> MatrixRow:
    """Строка матрицы для одного события — общий строитель для GET /matrix и
    PATCH /events, чтобы локи не разъезжались между двумя ответами."""
    if spec.tier == "critical":
        eff = set(spec.default_channels)  # матрица игнорируется — шлём по дефолту
    else:
        eff = await studio_channels(db, studio_id, spec.role, event_id, spec.default_channels)

    locked = spec.tier == "critical"
    locked_channels: list[str] = []
    lock_reason: str | None = None
    if locked:
        lock_reason = "critical"
    elif spec.tier == "operational" and len(eff) == 1:
        locked_channels = list(eff)
        lock_reason = "last_channel"

    return MatrixRow(
        event_id=event_id, role=spec.role, tier=spec.tier,
        channels={ch: ch in eff for ch in NOTIFY_CHANNELS},
        locked=locked, locked_channels=locked_channels, lock_reason=lock_reason,
    )


@router.get("/notifications/matrix", response_model=MatrixRead)
async def get_notification_matrix(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    settings = await _get_or_create_settings(ctx.studio_id, db)
    connected = await connected_channels(db, ctx.studio_id)
    channels = [
        ChannelInfo(key=ch, connected=ch in connected, global_enabled=getattr(settings, f"{ch}_notifications"))
        for ch in NOTIFY_CHANNELS
    ]
    events = [await _matrix_row(db, ctx.studio_id, event_id, spec) for event_id, spec in CATALOG.items()]
    return MatrixRead(channels=channels, events=events)


async def _validate_toggles(db: AsyncSession, studio_id: int, toggles: list[EventToggle]) -> None:
    """Границе доверия (§2 API эпика): фронту не верим, интерфейс можно обойти
    curl'ом. critical — 409 на любую попытку; operational — 409, если пачка
    (с учётом ДРУГИХ тумблеров той же пачки на тот же event_id) гасит последний
    включённый канал."""
    by_event: dict[tuple[str, str], list[EventToggle]] = defaultdict(list)
    for t in toggles:
        spec = CATALOG.get(t.event_id)
        if spec is None or spec.role != t.role:
            raise HTTPException(status_code=422, detail={
                "code": "notifications.unknown_event", "message": f"Неизвестное событие: {t.event_id}",
            })
        if spec.tier == "critical":
            raise HTTPException(status_code=409, detail={
                "code": "notifications.critical_locked", "message": "Это уведомление отключить нельзя",
            })
        by_event[(t.role, t.event_id)].append(t)

    for (role, event_id), items in by_event.items():
        spec = CATALOG[event_id]
        if spec.tier != "operational":
            continue
        eff = await studio_channels(db, studio_id, role, event_id, spec.default_channels)
        for t in items:  # применяем пачку к текущему состоянию по порядку — как ON CONFLICT DO UPDATE
            eff = (eff | {t.channel_key}) if t.is_enabled else (eff - {t.channel_key})
        if not eff:
            raise HTTPException(status_code=409, detail={
                "code": "notifications.last_channel", "message": "Нужен хотя бы один канал доставки",
            })


@router.get("/notifications/events", response_model=list[EventToggle])
async def get_event_toggles(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    toggles = (await db.execute(
        select(NotificationEventToggle).where(NotificationEventToggle.studio_id == ctx.studio_id)
    )).scalars().all()
    return toggles


@router.patch("/notifications/events", response_model=MatrixRow)
async def upsert_event_toggle(
    body: EventToggle,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    await _validate_toggles(db, ctx.studio_id, [body])

    toggle = (await db.execute(
        select(NotificationEventToggle).where(
            NotificationEventToggle.studio_id == ctx.studio_id,
            NotificationEventToggle.role == body.role,
            NotificationEventToggle.event_id == body.event_id,
            NotificationEventToggle.channel_key == body.channel_key,
        )
    )).scalar_one_or_none()
    if toggle is None:
        toggle = NotificationEventToggle(studio_id=ctx.studio_id, **body.model_dump())
        db.add(toggle)
    else:
        toggle.is_enabled = body.is_enabled
    await db.commit()

    # Отдаём строку матрицы целиком (не одну ячейку) — после изменения мог
    # смениться locked_channels, фронту не нужен второй запрос (§ API эпика).
    return await _matrix_row(db, ctx.studio_id, body.event_id, CATALOG[body.event_id])


@router.patch("/notifications/events/bulk", response_model=list[EventToggle])
async def bulk_upsert_event_toggles(
    body: EventToggleBulkUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Пачка тумблеров матрицы — один INSERT ... ON CONFLICT, одна транзакция
    (EPIC N-8: дефект B — было 2×N запросов на серию кликов)."""
    await _validate_toggles(db, ctx.studio_id, body.toggles)

    rows = [
        {
            "studio_id": ctx.studio_id,  # studio_id всегда из контекста, не из тела
            "role": t.role,
            "event_id": t.event_id,
            "channel_key": t.channel_key,
            "is_enabled": t.is_enabled,
        }
        for t in body.toggles
    ]
    stmt = (
        pg_insert(NotificationEventToggle)
        .values(rows)
        .on_conflict_do_update(
            constraint="uq_notif_toggle",
            set_={"is_enabled": pg_insert(NotificationEventToggle).excluded.is_enabled},
        )
        .returning(NotificationEventToggle)
    )
    result = (await db.execute(stmt)).scalars().all()
    await db.commit()
    return result


# ─── EPIC 3, Задача 3: личные настройки («Мои уведомления») ─────────────────
# Все роли (владелец тоже получает o1/o2) — не require_role, только контекст студии.
@router.get("/notifications/me", response_model=UserPrefRead)
async def get_my_notification_prefs(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    optional_ids = [eid for eid, spec in events_for_role(ctx.role).items() if spec.tier == "optional"]
    rows = (await db.execute(
        select(UserNotificationPreference).where(
            UserNotificationPreference.user_id == ctx.user.id,
            UserNotificationPreference.event_id.in_(optional_ids),
        )
    )).scalars().all()
    overrides: dict[str, dict[str, bool]] = defaultdict(dict)
    for r in rows:
        overrides[r.event_id][r.channel_key] = r.is_enabled

    events = [
        UserPrefRow(event_id=eid, channels={ch: overrides[eid].get(ch, True) for ch in NOTIFY_CHANNELS})
        for eid in optional_ids
    ]
    return UserPrefRead(events=events)


@router.patch("/notifications/me", response_model=UserPrefRow)
async def update_my_notification_pref(
    body: UserPrefUpdate,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    spec = CATALOG.get(body.event_id)
    if spec is None or spec.role != ctx.role:
        raise HTTPException(status_code=422, detail={
            "code": "notifications.unknown_event", "message": "Неизвестное событие",
        })
    if spec.tier != "optional":
        raise HTTPException(status_code=409, detail={
            "code": "notifications.not_personal",
            "message": "Личные настройки не могут менять обязательные уведомления",
        })

    pref = (await db.execute(
        select(UserNotificationPreference).where(
            UserNotificationPreference.user_id == ctx.user.id,
            UserNotificationPreference.event_id == body.event_id,
            UserNotificationPreference.channel_key == body.channel_key,
        )
    )).scalar_one_or_none()
    if pref is None:
        db.add(UserNotificationPreference(
            user_id=ctx.user.id, event_id=body.event_id,
            channel_key=body.channel_key, is_enabled=body.is_enabled,
        ))
    else:
        pref.is_enabled = body.is_enabled
    await db.commit()

    rows = (await db.execute(
        select(UserNotificationPreference).where(
            UserNotificationPreference.user_id == ctx.user.id,
            UserNotificationPreference.event_id == body.event_id,
        )
    )).scalars().all()
    overrides = {r.channel_key: r.is_enabled for r in rows}
    return UserPrefRow(event_id=body.event_id, channels={ch: overrides.get(ch, True) for ch in NOTIFY_CHANNELS})
