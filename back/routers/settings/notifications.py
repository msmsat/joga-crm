from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, get_studio_context, StudioContext
from models import (
    NotificationEventToggle,
    NotificationLog,
    StudioNotificationSettings,
    UserNotificationPreference,
)
from services.notification_catalog import CATALOG, ROLE_CHANNELS, events_for_role
from services.notification_resolver import connected_channels, studio_channels
from services.notifier import NOTIFY_CHANNELS
from services.whatsapp import enable_blocker as wa_enable_blocker
from schemas.settings.notifications import (
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    EventToggle,
    EventToggleBulkUpdate,
    ChannelInfo,
    MatrixRow,
    MatrixRead,
    NotificationLogRead,
    NotificationLogRow,
    NotificationLogSummary,
    UserPrefRow,
    UserPrefRead,
    UserPrefUpdate,
)

router = APIRouter()

# Поля NotificationLogSummary. Считанные из БД статусы фильтруем по этому набору:
# в таблице может лежать значение, которого в схеме нет (старая строка, будущий
# статус воркера), и оно не должно ронять эндпоинт на неизвестном ключе.
_LOG_STATUSES = frozenset(NotificationLogSummary.model_fields)


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
    data = body.model_dump(exclude_unset=True, by_alias=True)
    # Включить WhatsApp можно только когда сняты ВСЕ ТРИ барьера Meta: карта,
    # верификация бизнеса и одобренные шаблоны (services/whatsapp.enable_blocker).
    # Иначе доставка ровно ноль, а включённый тумблер обещает рассылку, которой
    # нет. Номер при этом остаётся подключённым — авто-ответчик отвечает на
    # входящие в 24-часовом окне бесплатно, ему ни карта, ни шаблоны не нужны.
    # detail — код конкретного барьера: интерфейс переводит его в подсказку,
    # объясняющую, что именно делать дальше.
    if data.get("whatsapp_notifications") is True:
        blocker = await wa_enable_blocker(db, ctx.studio_id)
        if blocker:
            raise HTTPException(status_code=409, detail=blocker)
    for field, value in data.items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)
    return settings


# ─── EPIC 3, Задача 3: матрица «событие × канал» ─────────────────────────────
async def _matrix_row(db: AsyncSession, studio_id: int, event_id: str, spec) -> MatrixRow:
    """Строка матрицы для одного события — общий строитель для GET /matrix и
    PATCH /events.

    Все уровни читаются одинаково, через studio_channels: галка показывает
    ровно то, что сохранено, иначе выключенная ячейка critical отскакивала бы
    обратно. Поля locked* остались в схеме, но всегда пустые — замков в матрице
    нет: снять можно любую галку, включая critical, вплоть до полной тишины.

    channels строится только по ROLE_CHANNELS[spec.role] (для персонала —
    email/whatsapp, без telegram): их всё равно не доставить этой роли
    (resolve_channels), значит фронту незачем рисовать по ним кликабельную,
    но нерабочую галочку.
    """
    eff = await studio_channels(db, studio_id, spec.role, event_id, spec.default_channels)
    return MatrixRow(
        event_id=event_id, role=spec.role, tier=spec.tier,
        channels={ch: ch in eff for ch in ROLE_CHANNELS[spec.role]},
        locked=False, locked_channels=[], lock_reason=None,
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
    curl'ом — неизвестное событие или чужая роль по-прежнему 422.

    Запреты «critical отключить нельзя» и «нужен хотя бы один канал» сняты вместе
    с замками в матрице: владелец волен выключить любую ячейку, включая последнюю,
    и тогда событие не уйдёт вообще — так и задумано (см. докстринг
    services/notification_resolver.py). Гарантия доставки держится на дефолтах:
    пока владелец ничего не трогал, email включён у всех 38 событий.
    """
    for t in toggles:
        spec = CATALOG.get(t.event_id)
        if spec is None or spec.role != t.role:
            raise HTTPException(status_code=422, detail={
                "code": "notifications.unknown_event", "message": f"Неизвестное событие: {t.event_id}",
            })
        # Персоналу telegram не доставить структурно (ROLE_CHANNELS), а instagram
        # не доставить вообще никому — без этой проверки владелец мог бы выставить
        # галку, которая тихо ничего не отправляет: resolve_channels её отфильтрует.
        if t.channel_key not in ROLE_CHANNELS[t.role]:
            raise HTTPException(status_code=422, detail={
                "code": "notifications.channel_unavailable_for_role",
                "message": f"Канал {t.channel_key} недоступен роли {t.role}",
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

    # channels — только по ROLE_CHANNELS роли: у персонала telegram никогда не
    # доставится (см. _matrix_row выше), личным настройкам незачем предлагать
    # выключатель для канала, которого для этой роли не существует.
    events = [
        UserPrefRow(event_id=eid, channels={ch: overrides[eid].get(ch, True) for ch in ROLE_CHANNELS[ctx.role]})
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
    if body.channel_key not in ROLE_CHANNELS[ctx.role]:
        raise HTTPException(status_code=422, detail={
            "code": "notifications.channel_unavailable_for_role",
            "message": f"Канал {body.channel_key} недоступен роли {ctx.role}",
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
    return UserPrefRow(event_id=body.event_id, channels={ch: overrides.get(ch, True) for ch in ROLE_CHANNELS[ctx.role]})


@router.get("/notifications/log", response_model=NotificationLogRead)
async def get_notification_log(
    status: Optional[str] = None,
    channel: Optional[str] = None,
    search: Optional[str] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Журнал отправок студии (эпик N-10): что, кому, когда и с каким исходом ушло.

    Отвечает на два разных вопроса одним экраном:
      - «вы отправляли клиенту напоминание?» — поиск по реквизиту получателя;
      - «всё ли доходит вообще?» — счётчики сверху. rejected > 0 и есть тот самый
        молчаливый провал, из-за которого отклонённый Meta шаблон хоронил своё
        событие и никто об этом не узнавал.

    Счётчики считаются по ТЕМ ЖЕ фильтрам, что и список, но без фильтра status —
    иначе, выбрав «только отклонённые», студия увидела бы «отклонено 12, остальное
    ноль» и решила бы, что сломано всё.
    """
    filters = [NotificationLog.studio_id == ctx.studio_id]
    if channel is not None:
        filters.append(NotificationLog.channel == channel)
    if search:
        like = f"%{search.strip()}%"
        filters.append(or_(
            NotificationLog.recipient_address.ilike(like),
            NotificationLog.event_id.ilike(like),
        ))

    counts = (await db.execute(
        select(NotificationLog.status, func.count())
        .where(*filters)
        .group_by(NotificationLog.status)
    )).all()
    summary = NotificationLogSummary(**{s: n for s, n in counts if s in _LOG_STATUSES})

    if status is not None:
        filters.append(NotificationLog.status == status)

    total = (await db.execute(
        select(func.count()).select_from(NotificationLog).where(*filters)
    )).scalar_one()
    rows = (await db.execute(
        select(NotificationLog)
        .where(*filters)
        .order_by(NotificationLog.created_at.desc(), NotificationLog.id.desc())
        .offset(offset).limit(limit)
    )).scalars().all()

    return NotificationLogRead(
        summary=summary,
        items=[NotificationLogRow.model_validate(r) for r in rows],
        total=total, offset=offset, limit=limit,
    )
