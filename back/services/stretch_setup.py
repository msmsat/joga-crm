"""Transactional setup of the explicitly approved test and MY STRETCH studios."""
from datetime import datetime, timezone
from sqlalchemy import select, func
from models import (Studio, StudioMember, User, StudioSetupLink, StudioBranch, Hall, Service,
    ServiceScheduleSlot, StudioBookingSettings, StudioSubscriptionProgramConfig,
    SubscriptionPackage, ClientSubscription, RecurringLessonTemplate, StudioWorkingHours, BranchWorkingHours,
    StaffWorkingHours, PaymentMethodConfig, user_services)
from services import stretch_preset as preset, studio_time, schedule_guard
from services.recurring_schedule import generate_for_studio


class SetupConflict(ValueError):
    pass


async def _linked(db, scope_id, link_key, model, *, setup_preset=preset.PRESET, **values):
    link = await db.scalar(select(StudioSetupLink).where(StudioSetupLink.studio_id == scope_id,
        StudioSetupLink.preset == setup_preset, StudioSetupLink.key == link_key))
    if link:
        if link.entity_type != model.__tablename__:
            raise SetupConflict(f'Invalid setup identity: {link_key}')
        row = await db.get(model, link.entity_id)
        if not row or getattr(row, 'studio_id', scope_id) != scope_id:
            raise SetupConflict(f'Previously configured object was removed: {link_key}; review explicitly')
        return row, False
    if 'name' in values and hasattr(model, 'studio_id'):
        if await db.scalar(select(model.id).where(model.studio_id == scope_id, model.name == values['name'])):
            raise SetupConflict(f'Manually created object has the same name: {values["name"]}')
    row = model(**values)
    db.add(row)
    await db.flush()
    db.add(StudioSetupLink(studio_id=scope_id, preset=setup_preset, key=link_key,
        entity_type=model.__tablename__, entity_id=row.id))
    await db.flush()
    return row, True


async def _adopt_legacy_package(db, studio_id, setup_preset, key, values):
    """Reuse only the two confirmed unsold legacy packages; preserve sold terms."""
    legacy = {'group4': ('4 заняття', 4, 1600), 'group8': ('8 заннять', 8, 2800)}
    if key not in legacy or await db.scalar(select(StudioSetupLink.id).where(
            StudioSetupLink.studio_id == studio_id, StudioSetupLink.preset == setup_preset,
            StudioSetupLink.key == f'package:{key}')):
        return None
    name, visits, price = legacy[key]
    rows = (await db.scalars(select(SubscriptionPackage).where(
        SubscriptionPackage.studio_id == studio_id, SubscriptionPackage.name == name,
        SubscriptionPackage.class_count == visits, SubscriptionPackage.price == price,
        SubscriptionPackage.duration_days == 30))).all()
    if len(rows) > 1:
        raise SetupConflict(f'Multiple legacy packages match {name}; review explicitly')
    if not rows:
        return None
    row = rows[0]
    if row.service_ids is not None:
        raise SetupConflict(f'Legacy package {row.id} already has service restrictions; review explicitly')
    used = await db.scalar(select(func.count(ClientSubscription.id)).where(
        ClientSubscription.package_id == row.id))
    if used:
        raise SetupConflict(f'Legacy package {row.id} is already sold; its terms were preserved')
    before = {'id': row.id, 'name': row.name, 'visits': row.class_count, 'service_ids': row.service_ids}
    for field, value in values.items():
        setattr(row, field, value)
    db.add(StudioSetupLink(studio_id=studio_id, preset=setup_preset, key=f'package:{key}',
        entity_type=SubscriptionPackage.__tablename__, entity_id=row.id))
    await db.flush()
    return before


async def _hours(db, studio_id, branch_id, teacher_id):
    """Expand only initial agreed weekdays, preserve breaks/overrides and unrelated days."""
    changes = []
    for model, scope in ((StudioWorkingHours, {'studio_id': studio_id}),
                         (BranchWorkingHours, {'branch_id': branch_id}),
                         (StaffWorkingHours, {'studio_id': studio_id, 'user_id': teacher_id})):
        for day, opening, closing in ((0,'09:00','18:00'),(2,'09:00','18:00'),
                                     (4,'09:00','18:00'),(5,'10:00','15:00')):
            row = await db.scalar(select(model).filter_by(**scope, day_of_week=day))
            before = None if not row else {'is_open':row.is_open, 'open_time':row.open_time,
                                           'close_time':row.close_time, 'breaks':getattr(row,'breaks',None)}
            if row is None:
                row = model(**scope, day_of_week=day, is_open=True, open_time=opening, close_time=closing)
                db.add(row)
            else:
                row.is_open = True
                row.open_time = min(row.open_time, opening)
                row.close_time = max(row.close_time, closing)
            changes.append({'table':model.__tablename__,'weekday':day,'before':before,
                            'after': {'open_time':row.open_time,'close_time':row.close_time}})
    return changes


async def _configure(db, studio, owner, *, now, setup_preset, owner_email, live):
    studio_id = studio.id
    initialized = await db.scalar(select(StudioSetupLink).where(StudioSetupLink.studio_id == studio_id,
        StudioSetupLink.preset == setup_preset, StudioSetupLink.key == 'settings'))
    if not initialized:
        if studio.tz_iana not in (None, 'Europe/Prague'):
            raise SetupConflict('Existing studio timezone differs; review before changing lesson times')
        if not live:
            studio.name = 'Стретч'
        studio.currency, studio.language = 'CZK', 'uk'
        studio.tz_iana, studio.booking_mode, studio.terminology_profile = 'Europe/Prague', 'event', 'studio'
        studio.business_type, studio.business_subtype = 'studio', 'stretching'
        studio.strict_schedule_enabled = True
        studio.booking_config_version += 1
    branches = (await db.scalars(select(StudioBranch).where(StudioBranch.studio_id == studio_id))).all()
    if len(branches) > 1:
        raise SetupConflict('More than one branch: choose the target branch explicitly')
    branch = branches[0] if branches else (await _linked(db, studio_id, 'branch', StudioBranch,
                studio_id=studio_id, name='Основна студія', setup_preset=setup_preset))[0]
    hall, _ = await _linked(db, studio_id, 'hall', Hall, studio_id=studio_id, branch_id=branch.id,
        name='Зал стретчингу', capacity=10, is_active=True, color='#C987B3', setup_preset=setup_preset)
    ids = {}
    for key, (name, price, capacity, format_, category) in preset.SERVICES.items():
        service, created = await _linked(db, studio_id, f'service:{key}', Service, studio_id=studio_id,
            name=name, price=price, duration_min=60, category=category, service_type=format_,
            booking_mode='event', max_clients=capacity, color='#C987B3', is_bookable=True,
            setup_preset=setup_preset)
        ids[key] = service.id
        if created:
            await db.execute(user_services.insert().values(user_id=owner.user_id, service_id=service.id))
    group_ids = [ids[k] for k in ('back','splits','combined')]
    cfg = await db.scalar(select(StudioSubscriptionProgramConfig).where(
        StudioSubscriptionProgramConfig.studio_id == studio_id))
    if cfg is None:
        cfg = StudioSubscriptionProgramConfig(studio_id=studio_id)
        db.add(cfg)
        await db.flush()
    if not initialized:
        cfg.is_enabled, cfg.allow_freeze, cfg.auto_renewal = True, True, False
        cfg.max_freeze_days, cfg.renewal_discount_percent = 14, 10
    packages = []
    adopted_packages = []
    for index, (key, name, visits, price, days, format_) in enumerate(preset.PACKAGES):
        values = dict(
            studio_id=studio_id, config_id=cfg.id, name=name, class_count=visits,
            price=price, per_visit_price=price//visits, duration_days=days,
            service_ids=group_ids if format_=='group' else [ids['individual']],
            sold_as_single=False, sold_as_subscription=True, is_active=True, sort_order=index)
        if live and not initialized:
            adopted = await _adopt_legacy_package(db, studio_id, setup_preset, key, values)
            if adopted:
                adopted_packages.append(adopted)
        package, _ = await _linked(db, studio_id, f'package:{key}', SubscriptionPackage,
            setup_preset=setup_preset, **values)
        packages.append({'id':package.id,'name':package.name,'price':package.price,
                         'visits':package.class_count,'days':package.duration_days,'service_ids':package.service_ids})
    booking = await db.scalar(select(StudioBookingSettings).where(StudioBookingSettings.studio_id == studio_id))
    if booking is None:
        booking = StudioBookingSettings(studio_id=studio_id)
        db.add(booking)
    if not initialized:
        booking.booking_active, booking.prefill_on_booking = True, False
        booking.booking_window_days, booking.widget_language = 30, 'uk'
        booking.trial_lesson_free, booking.trial_discount_type = True, 'amount'
        booking.trial_discount_amount, booking.trial_service_ids = 200, group_ids
    if not initialized:
        cash = await db.scalar(select(PaymentMethodConfig).where(
            PaymentMethodConfig.studio_id == studio_id, PaymentMethodConfig.method_type == 'cash'))
        if cash is None:
            db.add(PaymentMethodConfig(studio_id=studio_id, method_type='cash', method_name='Готівка', is_enabled=True))
        else:
            cash.is_enabled = True
    hours_changes = await _hours(db, studio_id, branch.id, owner.user_id) if not initialized else []
    day = studio_time.to_local(now, studio).date()
    template_ids = []
    for weekday, minute, key in preset.SLOTS:
        template, created = await _linked(db, studio_id, f'template:{weekday}:{minute}', RecurringLessonTemplate,
            studio_id=studio_id, key=f'stretch:{weekday}:{minute}', service_id=ids[key], teacher_id=owner.user_id,
            hall_id=hall.id, weekday=weekday, start_minute=minute, duration_min=60,
            total_spots=10, price=450, starts_on=day, is_enabled=True, setup_preset=setup_preset)
        template_ids.append(template.id)
        if created:
            start = f'{minute//60:02d}:{minute%60:02d}'
            end = f'{(minute+60)//60:02d}:{(minute+60)%60:02d}'
            db.add(ServiceScheduleSlot(service_id=ids[key], day_of_week=weekday, start_time=start, end_time=end))
    if not initialized:
        db.add(StudioSetupLink(studio_id=studio_id, preset=setup_preset, key='settings',
                              entity_type='studios', entity_id=studio_id))
    await db.flush()
    schedule = await generate_for_studio(db, studio_id, now=now)
    return {'studio_id':studio_id,'owner_id':owner.user_id,'owner_email':owner_email,
        'service_ids':ids,'services':len(ids),'hall_id':hall.id,'packages':packages,
        'weekly_templates':len(template_ids),'template_ids':template_ids,'adopted_packages':adopted_packages,
        'hours_changes':hours_changes,'booking_window_days':booking.booking_window_days,
        'trial_group_price':250,'individual_price':1000,'schedule':schedule,
        'warnings':['Адреса залу не заповнена; додайте її в каталозі.',
                    'Онлайн-оплата потребує власного підключення Stripe у налаштуваннях студії.']}


async def setup_studio(session_maker, *, studio_id, owner_email, apply=False, now=None):
    targets = {17: (6, 'sadomat31@gmail.com', preset.PRESET, False),
               16: (44, 'tokarmaria1106@gmail.com', 'stretch-live-v1', True)}
    target = targets.get(studio_id)
    if target is None or owner_email.strip().lower() != target[1]:
        raise ValueError('Use an approved studio and its matching owner email (studio 17 or 16)')
    expected_owner, expected_email, setup_preset, live = target
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        raise ValueError('Setup requires an aware instant')
    async with session_maker() as db:
        async with db.begin():
            studio = await schedule_guard.lock_studio(db, studio_id)
            owner = await db.scalar(select(StudioMember).join(User, User.id == StudioMember.user_id).where(
                StudioMember.studio_id == studio_id, StudioMember.user_id == expected_owner,
                StudioMember.status == 'active', StudioMember.role == 'owner',
                func.lower(User.email) == expected_email))
            if not owner:
                raise ValueError('Expected active owner was not found; no changes applied')
            try:
                result = await _configure(db, studio, owner, now=moment, setup_preset=setup_preset,
                    owner_email=expected_email, live=live)
                ready = not result['schedule']['conflicts']
                result.update(ready=ready, complete=bool(apply and ready),
                              mode='apply' if apply else 'preview', preset=setup_preset)
            except SetupConflict as exc:
                result = {'ready':False,'complete':False,'error':str(exc),'studio_id':studio_id,'owner_id':expected_owner}
                ready = False
            if not apply or not ready:
                await db.rollback()
            return result
