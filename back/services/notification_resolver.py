"""Резолвер каналов доставки (EPIC 3, Задача 2) — единственное место, которое решает
«куда слать» для notify(). Формула (docs/ROADMAP_SETTINGS/EPIC_03_NOTIFICATIONS.md, §4):

    critical     -> studio_channels                        (личный слой не применяется)
    operational  -> studio_channels                        (личный слой не применяется)
    optional     -> studio_channels ∩ user_channels
    затем        -> ∩ ROLE_CHANNELS(role) ∩ enabled_global(studio) ∩ connected_channels(studio)
    пусто        -> тишина, у ЛЮБОГО тира

Выключено — значит выключено (решение владельца продукта, 06.08.2026). Раньше
здесь был форс-фолбэк: пустой набор у critical/operational превращался в {email},
чтобы «гарантировать доставку». Практический эффект был обратный ожидаемому —
владелец снимал галки, а письма продолжали приходить, и тумблер врал.

Гарантия доставки никуда не делась, но держится теперь на дефолтах, а не на
обходе настроек: email входит в default_channels ВСЕХ 38 событий (проверяет
tests/test_notification_catalog.test_every_event_can_reach_someone) и всегда
числится подключённым. Пока владелец ничего не менял, событию есть куда уйти.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import NotificationEventToggle, StudioIntegration, StudioNotificationSettings, UserNotificationPreference
from services.notification_catalog import CATALOG, ROLE_CHANNELS
from services.notifier import NOTIFY_CHANNELS

logger = logging.getLogger(__name__)

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


# Дефолты колонок StudioNotificationSettings (email/telegram/whatsapp — True,
# instagram — False), прочитанные из самой модели, чтобы не разъехались с ней.
_DEFAULT_ENABLED = frozenset(
    ch for ch in NOTIFY_CHANNELS
    if StudioNotificationSettings.__table__.c[f"{ch}_notifications"].default.arg
)


async def _enabled_global(db: AsyncSession, studio_id: int) -> set[str]:
    """Глобальный рубильник канала (StudioNotificationSettings.*_notifications).

    Строки настроек нет, пока владелец ни разу не открывал «Уведомления» — а это
    большинство студий. Считать это «всё выключено» означало, что у такой студии
    не работает ни один канал, кроме forced-фолбэка (email) у critical: telegram
    молчал даже при подключённом боте и галках в матрице. Поэтому отсутствие
    строки = дефолты модели, ровно те, что получила бы студия при создании строки."""
    settings = (await db.execute(
        select(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == studio_id)
    )).scalar_one_or_none()
    if settings is None:
        return set(_DEFAULT_ENABLED)
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
    """→ (каналы к отправке, forced). forced всегда False: страховка убрана, см.
    докстринг модуля. Второй элемент кортежа сохранён — на него завязаны notify()
    и подменные resolve_channels в тестах.
    recipient_user_id — User.id получателя для личного слоя (только staff-роли,
    role="client" его не имеет — передавайте None)."""
    spec = CATALOG.get(event_id)
    if spec is None or spec.role != role:
        return set(), False

    # Матрица владельца учитывается на всех уровнях, включая critical: замков в
    # ней нет, и выключенная галка обязана что-то значить — вплоть до полной
    # тишины (см. докстринг модуля).
    channels = await studio_channels(db, studio_id, role, event_id, spec.default_channels)
    # Структурное ограничение роли — не настройка, применяется всегда, даже
    # если в NotificationEventToggle лежит устаревшая/подделанная строка вроде
    # channel_key=telegram для role=trainer (её сама по себе может завести
    # только код старой версии или curl мимо _validate_toggles; каталог такую
    # комбинацию больше не производит — см. self-check в notification_catalog).
    channels &= ROLE_CHANNELS.get(role, frozenset())
    if spec.tier == "optional" and role != "client" and recipient_user_id is not None:
        channels &= await _user_channels(db, recipient_user_id, event_id)

    enabled = await _enabled_global(db, studio_id)
    connected = await connected_channels(db, studio_id)
    channels &= enabled
    channels &= connected

    # Выключено — значит выключено, у ЛЮБОГО тира. Форс-фолбэка здесь больше нет:
    # раньше пустой набор у critical/operational превращался в {email}, и снятая
    # владельцем галка ничего не значила — письмо всё равно уходило.
    #
    # Заглушить ненастроенную студию это не может: без строк матрицы
    # studio_channels возвращает default_channels, а email входит в них у всех 38
    # событий (tests/test_notification_catalog.test_every_event_can_reach_someone)
    # и всегда числится подключённым (connected_channels). Значит пустой набор
    # при включённом глобально email достижим ТОЛЬКО явным действием владельца.
    if not channels:
        logger.info(
            "notify: событие %s/%s студии %s выключено владельцем — не отправляем",
            role, event_id, studio_id,
        )
    return channels, False
