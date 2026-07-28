"""Резолвер каналов доставки (EPIC 3, Задача 2) — единственное место, которое решает
«куда слать» для notify(). Формула (docs/ROADMAP_SETTINGS/EPIC_03_NOTIFICATIONS.md, §4):

    critical     -> default_channels                      (настройки игнорируются)
    operational  -> studio_channels                        (личный слой не применяется)
    optional     -> studio_channels ∩ user_channels
    затем        -> ∩ enabled_global(studio) ∩ connected_channels(studio)
    и если пусто и tier != optional -> {fallback}, forced=True

Гарантированный канал (Guaranteed Delivery Channel, §3): forced-фолбэк шлётся
невзирая на глобальные настройки/подключение канала — это последняя страховка,
а не ещё один фильтр.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import NotificationEventToggle, StudioIntegration, StudioNotificationSettings, UserNotificationPreference
from services.notification_catalog import CATALOG
from services.notifier import NOTIFY_CHANNELS

_CHANNEL_INTEGRATION = {"telegram": "tg_notify", "whatsapp": "wa_notify", "instagram": "ig_dm"}


async def studio_channels(db: AsyncSession, studio_id: int, role: str, event_id: str, default_channels: tuple[str, ...]) -> set[str]:
    """default_channels с точечными отклонениями из NotificationEventToggle — строка в
    таблице есть только там, где владелец что-то менял (см. каталог, §2)."""
    rows = (await db.execute(
        select(NotificationEventToggle.channel_key, NotificationEventToggle.is_enabled).where(
            NotificationEventToggle.studio_id == studio_id,
            NotificationEventToggle.role == role,
            NotificationEventToggle.event_id == event_id,
        )
    )).all()
    overrides = {row.channel_key: row.is_enabled for row in rows}
    return {ch for ch in NOTIFY_CHANNELS if overrides.get(ch, ch in default_channels)}


async def _user_channels(db: AsyncSession, user_id: int, event_id: str) -> set[str]:
    """Личный слой может только сузить: нет строки — канал разрешён (см. модель,
    is_enabled default=True), есть строка с is_enabled=False — канал вычитается."""
    rows = (await db.execute(
        select(UserNotificationPreference.channel_key, UserNotificationPreference.is_enabled).where(
            UserNotificationPreference.user_id == user_id,
            UserNotificationPreference.event_id == event_id,
        )
    )).all()
    overrides = {row.channel_key: row.is_enabled for row in rows}
    return {ch for ch in NOTIFY_CHANNELS if overrides.get(ch, True)}


async def _enabled_global(db: AsyncSession, studio_id: int) -> set[str]:
    """Глобальный рубильник канала (StudioNotificationSettings.*_notifications).
    Нет строки настроек — считаем всё выключенным; для critical это не страшно,
    ниже сработает forced-фолбэк."""
    settings = (await db.execute(
        select(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == studio_id)
    )).scalar_one_or_none()
    if settings is None:
        return set()
    return {ch for ch in NOTIFY_CHANNELS if getattr(settings, f"{ch}_notifications")}


async def connected_channels(db: AsyncSession, studio_id: int) -> set[str]:
    """email всегда «подключён» — уходит через платформенный SMTP (см. deliver()),
    отдельной интеграции не требует. telegram/whatsapp/instagram — только если
    StudioIntegration реально подключена (tg_notify/wa_notify/ig_dm)."""
    connected = {"email"}
    kinds = (await db.execute(
        select(StudioIntegration.integration_type).where(
            StudioIntegration.studio_id == studio_id,
            StudioIntegration.integration_type.in_(_CHANNEL_INTEGRATION.values()),
            StudioIntegration.is_connected == True,  # noqa: E712
        )
    )).scalars().all()
    channel_by_kind = {kind: channel for channel, kind in _CHANNEL_INTEGRATION.items()}
    connected.update(channel_by_kind[kind] for kind in kinds)
    return connected


async def resolve_channels(
    db: AsyncSession, studio_id: int, role: str, event_id: str,
    recipient_user_id: int | None,
) -> tuple[set[str], bool]:
    """→ (каналы к отправке, forced). forced=True — сработала страховка (§3).
    recipient_user_id — User.id получателя для личного слоя (только staff-роли,
    role="client" его не имеет — передавайте None)."""
    spec = CATALOG.get(event_id)
    if spec is None or spec.role != role:
        return set(), False

    if spec.tier == "critical":
        channels = set(spec.default_channels)
    else:
        channels = await studio_channels(db, studio_id, role, event_id, spec.default_channels)
        if spec.tier == "optional" and role != "client" and recipient_user_id is not None:
            channels &= await _user_channels(db, recipient_user_id, event_id)

    channels &= await _enabled_global(db, studio_id)
    channels &= await connected_channels(db, studio_id)

    if not channels and spec.tier != "optional":
        return {spec.fallback}, True
    return channels, False
