"""Opt-in bounded package freeze; legacy studios keep their former behavior."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from models import Client, ClientSubscription, Lesson, Reservation, StudioSubscriptionProgramConfig
from services import schedule_guard, studio_time

logger = logging.getLogger(__name__)


async def _context(db, studio_id, client_id):
    studio = await schedule_guard.lock_studio(db, studio_id)
    if not studio_time.clock(studio).verified:
        raise ValueError('Підтвердьте часовий пояс студії перед замороженням.')
    client = await db.scalar(select(Client).where(Client.id == client_id,
        Client.studio_id == studio_id).with_for_update().execution_options(populate_existing=True))
    config = await db.scalar(select(StudioSubscriptionProgramConfig).where(
        StudioSubscriptionProgramConfig.studio_id == studio_id))
    if not client or not config or config.max_freeze_days is None:
        raise ValueError('Для клієнта не налаштовано правила замороження.')
    subs = (await db.scalars(select(ClientSubscription).where(ClientSubscription.client_id == client_id)
        .order_by(ClientSubscription.id).with_for_update().execution_options(populate_existing=True))).all()
    return studio, client, config, subs


def _instant(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def freeze_for_client(db, studio_id, client_id, *, now):
    if now.tzinfo is None:
        raise ValueError("Freeze requires an aware instant")
    studio, client, config, subs = await _context(db, studio_id, client_id)
    if not config.allow_freeze:
        raise ValueError('Замороження абонементів вимкнено.')
    if any(s.is_frozen for s in subs):
        return {'frozen': True, 'changed': False}
    local_now = studio_time.to_local(now, studio)
    eligible = [s for s in subs if s.status in ('active', 'pending')
                and s.used_classes < s.total_classes
                and (s.status == 'pending' or s.expires_at >= local_now.date())]
    if not eligible or any((s.freeze_used_days or 0) >= config.max_freeze_days for s in eligible):
        raise ValueError('Немає активного абонемента з доступними днями замороження.')
    # Existing paid places are facts. Ask the administrator to move/cancel them first.
    booked = await db.scalar(select(Reservation.id).join(Lesson, Lesson.id == Reservation.lesson_id).where(
        Reservation.client_id == client_id, Reservation.status.in_(('active', 'pending', 'hold')),
        Lesson.status != 'cancelled', Lesson.start_time >= local_now.replace(tzinfo=None),
        Lesson.start_time < (local_now + timedelta(days=config.max_freeze_days)).replace(tzinfo=None)).limit(1))
    if booked:
        raise ValueError('Спочатку перенесіть або скасуйте наявні записи на період замороження.')
    client.freeze_restore_status = client.status
    client.freeze_restore_active = client.is_active
    client.status, client.is_active = 'frozen', False
    for sub in eligible:
        days = config.max_freeze_days - (sub.freeze_used_days or 0)
        deadline = studio_time.to_utc((local_now + timedelta(days=days)).replace(tzinfo=None), studio)
        sub.is_frozen = True
        sub.frozen_at = now.astimezone(timezone.utc).replace(tzinfo=None)
        sub.freeze_until = deadline.replace(tzinfo=None)
    return {'frozen': True, 'changed': True}


async def unfreeze_for_client(db, studio_id, client_id, *, now):
    if now.tzinfo is None:
        raise ValueError("Freeze requires an aware instant")
    studio, client, config, subs = await _context(db, studio_id, client_id)
    changed = False
    deadlines = [_instant(s.freeze_until) for s in subs if s.is_frozen and s.freeze_until]
    finish_at = min([now, *deadlines])
    for sub in subs:
        if not sub.is_frozen or not sub.frozen_at or not sub.freeze_until:
            continue
        finish = finish_at
        start_day = studio_time.to_local(_instant(sub.frozen_at), studio).date()
        finish_day = studio_time.to_local(finish, studio).date()
        days = max(0, min(config.max_freeze_days - (sub.freeze_used_days or 0), max(0, (finish_day-start_day).days)))
        if sub.status == 'active':
            sub.expires_at += timedelta(days=days)
        sub.freeze_used_days = (sub.freeze_used_days or 0) + days
        sub.is_frozen = False
        sub.freeze_until = None
        changed = True
    if changed:
        if client.status == 'frozen' and client.freeze_restore_status is not None:
            client.status = client.freeze_restore_status
            client.is_active = bool(client.freeze_restore_active)
        client.freeze_restore_status = client.freeze_restore_active = None
    return {'frozen': False, 'changed': changed}


async def resume_due_freezes(session_maker, *, now=None):
    moment = now or datetime.now(timezone.utc)
    async with session_maker() as db:
        rows = (await db.execute(select(Client.studio_id, Client.id).join(ClientSubscription).join(
            StudioSubscriptionProgramConfig, StudioSubscriptionProgramConfig.studio_id == Client.studio_id).where(
            StudioSubscriptionProgramConfig.max_freeze_days.is_not(None), ClientSubscription.is_frozen.is_(True),
            ClientSubscription.freeze_until <= moment.astimezone(timezone.utc).replace(tzinfo=None)).distinct())).all()
    for studio_id, client_id in rows:
        try:
            async with session_maker.begin() as db:
                result = await unfreeze_for_client(db, studio_id, client_id, now=moment)
                if result['changed']:
                    from activity import log_activity
                    log_activity(db, studio_id, 'unfreeze', title='Термін замороження завершено',
                        actor_name='Система', entity_type='client', entity_id=client_id)
        except Exception:
            logger.exception('Subscription resume studio=%s client=%s failed', studio_id, client_id)


def start_subscription_freeze_loop(session_maker):
    async def loop():
        while True:
            try:
                await resume_due_freezes(session_maker)
            except Exception:
                logger.exception('Subscription freeze resume failed')
            await asyncio.sleep(300)
    return asyncio.create_task(loop())
