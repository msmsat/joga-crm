"""Load a master's roster by date (e.g. a month from the master's own schedule). Preview by default.

Each date in --from..--to becomes a working day with --hours or, if listed in --off, a day off —
through the same handler as a click in the staff calendar (PUT /staff/{id}/schedule/day), so a
day with client bookings can't be turned into a day off. The weekly schedule gets --hours on every
weekday but stays closed: dates outside the roster are not bookable until the next one is loaded.

Saving the staff card (in the CRM or via set_master_prices) clears future date marks by design —
rerun this script afterwards.

From back/:
  python -m scripts.set_staff_month --owner-email OWNER --staff-email MASTER \
      --from 2026-10-01 --to 2026-11-01 --off 01.10,03.10 --hours 10:00-18:00
Apply only after preview: add --studio-id ID --apply.
"""
import argparse
import asyncio
import re
import shlex
import sys
from datetime import date, timedelta

from scripts.import_anastasia_services import choose_studio

DAYS = 'Пн Вт Ср Чт Пт Сб Вс'.split()


def parse_off(value, start, end):
    """'01.10,03.10' -> dates inside start..end (the year follows the range, across New Year too)."""
    found = set()
    for part in filter(None, (p.strip() for p in value.split(','))):
        day, month = map(int, part.split('.'))
        candidates = [d for year in (start.year, end.year)
                      if start <= (d := date(year, month, day)) <= end]
        if not candidates:
            raise ValueError(f'Выходной {part} вне периода {start}..{end}.')
        found.add(candidates[0])
    return found


async def run(args):
    from fastapi import HTTPException
    from sqlalchemy import func, select
    from database import async_session_maker
    from dependencies import StudioContext
    from models import (
        BranchWorkingHours, StaffBranchAssignment, Studio, StudioMember, StudioWorkingHours, User,
    )
    from routers.staff.profiles import _replace_schedule
    from routers.staff.schedule import _has_bookings, set_day_override
    from schemas.staff.staff import StaffDayOverrideRequest, StaffWorkingHoursItem
    from services import schedule_guard

    start, end = date.fromisoformat(args.date_from), date.fromisoformat(args.date_to)
    if end < start:
        raise ValueError('--to раньше --from.')
    if start < date.today():
        raise ValueError('Прошедшие дни менять нельзя: --from должен быть не раньше сегодняшнего дня.')
    off = parse_off(args.off, start, end)
    if args.apply and args.studio_id is None:
        raise ValueError('Для записи обязателен --studio-id ID из предпросмотра.')
    open_time, close_time = args.hours.split('-')

    async with async_session_maker() as db:
        owner = (await db.execute(select(User).where(
            func.lower(func.trim(User.email)) == args.owner_email.strip().lower(),
        ))).scalar_one_or_none()
        if owner is None:
            raise ValueError('Владелец с таким email не найден. Ничего не записано.')
        studios = list((await db.execute(select(Studio).join(
            StudioMember, StudioMember.studio_id == Studio.id,
        ).where(StudioMember.user_id == owner.id, StudioMember.role == 'owner',
                StudioMember.status == 'active').order_by(Studio.id))).scalars().all())
        print(f'Владелец: {owner.email}')
        for candidate in studios:
            print(f'  ID={candidate.id} | {candidate.name}')
        if not studios:
            raise ValueError('У аккаунта нет активного членства владельца студии.')
        studio = choose_studio(studios, args.studio_id)
        row = (await db.execute(select(User, StudioMember).join(
            StudioMember, StudioMember.user_id == User.id,
        ).where(StudioMember.studio_id == studio.id,
                func.lower(func.trim(User.email)) == args.staff_email.strip().lower()))).first()
        if row is None:
            raise ValueError(f'{args.staff_email} нет в команде студии {studio.name}. Ничего не записано.')
        master, member = row

        # Online booking is the overlap of studio, branch and master hours: a working day on a
        # weekday the studio or the master's branch is closed will show no free time.
        closed = {h.day_of_week for h in (await db.execute(select(StudioWorkingHours).where(
            StudioWorkingHours.studio_id == studio.id))).scalars() if not h.is_open}
        closed |= {h.day_of_week for h in (await db.execute(select(BranchWorkingHours).join(
            StaffBranchAssignment, StaffBranchAssignment.branch_id == BranchWorkingHours.branch_id,
        ).where(StaffBranchAssignment.user_id == master.id,
                StaffBranchAssignment.studio_id == studio.id))).scalars() if not h.is_open}

        dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        print(f'\n{"ЗАПИСЬ" if args.apply else "ПРЕДПРОСМОТР — без записи"}: {member.name} ({master.email}) '
              f'| {start:%d.%m}–{end:%d.%m} | рабочие дни {args.hours}')
        blocked, unbookable = [], []
        for day in dates:
            line = f'  {day:%d.%m} {DAYS[day.weekday()]} | ' + ('выходной' if day in off else args.hours)
            if day in off and await _has_bookings(master.id, studio.id, day, db):
                blocked.append(day)
                line += ' | СТОП: на этот день уже есть записи'
            elif day not in off and day.weekday() in closed:
                unbookable.append(day)
                line += ' | студия/филиал в этот день недели закрыты — онлайн-записи не будет'
            print(line)
        print(f'После {end:%d.%m} и до {start:%d.%m} (кроме уже прошедших дней) — не работает, '
              'пока не загружен следующий график.')
        if unbookable:
            print(f'ВНИМАНИЕ: {len(unbookable)} рабочих дней выпадают на дни недели, когда закрыта студия или '
                  'филиал. Откройте эти дни в часах работы студии и филиала, иначе к мастеру не записаться.')
        if blocked:
            raise ValueError('Есть записи клиентов в дни, которые должны стать выходными. Ничего не записано.')

        if not args.apply:
            command = ['docker', 'compose', 'exec', 'api', 'python', '-m', 'scripts.set_staff_month',
                       '--owner-email', owner.email, '--studio-id', str(studio.id),
                       '--staff-email', master.email, '--from', args.date_from, '--to', args.date_to,
                       '--off', ','.join(f'{d:%d.%m}' for d in sorted(off)), '--hours', args.hours]
            print('\nДля сохранения после проверки:')
            print(shlex.join(command + ['--apply']))
            return

        ctx = StudioContext(owner, studio.id, 'owner')
        # Weekly rows carry the hours for every weekday, closed; the dates below open them.
        studio_locked = await schedule_guard.lock_studio(db, studio.id)
        await _replace_schedule(master.id, studio.id, [
            StaffWorkingHoursItem(day_of_week=d, is_open=False, open_time=open_time, close_time=close_time)
            for d in range(7)], db)
        await db.flush()
        schedule_guard.raise_if_conflicts(
            await schedule_guard.assert_future_assignments_valid(db, studio_locked, user_id=master.id))
        await db.commit()
        try:
            for day in dates:
                await set_day_override(master.id, StaffDayOverrideRequest(
                    date=day.isoformat(), is_working=day not in off), ctx, db)
        except HTTPException as error:
            raise ValueError(f'Отказ сервера на {day:%d.%m}: {error.detail}. Дни до него записаны — '
                             'исправьте и запустите снова, повтор безопасен.')
        print(f'\nГОТОВО: {len(dates) - len(off)} рабочих дней, {len(off)} выходных.')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--owner-email', required=True)
    parser.add_argument('--studio-id', type=int)
    parser.add_argument('--staff-email', required=True)
    parser.add_argument('--from', dest='date_from', required=True, help='Первый день, ГГГГ-ММ-ДД')
    parser.add_argument('--to', dest='date_to', required=True, help='Последний день, ГГГГ-ММ-ДД')
    parser.add_argument('--off', default='', help='Выходные через запятую: 01.10,03.10')
    parser.add_argument('--hours', default='10:00-18:00', help='Часы рабочего дня, ЧЧ:ММ-ЧЧ:ММ')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{2}:\d{2}-\d{2}:\d{2}', args.hours):
        parser.error('--hours в формате 10:00-18:00.')
    try:
        asyncio.run(run(args))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception as error:
        # Do not print a connection URL, credentials or raw database errors.
        print(f'Ошибка ({type(error).__name__}). Успешное завершение не подтверждено; '
              'перед повтором выполните предпросмотр.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
