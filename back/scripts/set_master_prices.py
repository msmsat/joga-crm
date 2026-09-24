"""Give a master the studio's laser services at that master's own prices. Preview by default.

Runs the staff-card save (PUT /staff/{id}): the master gets every service of the price list,
a personal price where it differs from the catalog, and keeps profile, rate, schedule and
branches as they are (--days/--hours replace the schedule; no branch yet -> all studio branches).

Durations are per service, not per master: a price-list duration that differs from the
catalog is reported and the catalog one stays.

From back/:
  python -m scripts.set_master_prices --owner-email OWNER --staff-email MASTER --price-list melita
Apply only after preview: add --studio-id ID --apply.
"""
import argparse
import asyncio
import re
import shlex
import sys

from scripts.add_staff import build_schedule
from scripts.import_anastasia_services import ITEMS, choose_studio, normalized_name

# name in the catalog -> (price, minutes) from the master's own price list
PRICE_LISTS = {
    'anastasia': {item.name: (item.price, item.duration_min) for item in ITEMS},
    'melita': {
        'Класичне бікіні': (1000, 30),
        'Глибоке бікіні': (1400, 40),
        'Ніжки повністю': (2000, 50),
        'Ніжки з коліном': (1500, 30),
        'Ніжки вище коліна': (1500, 30),
        'Руки повністю': (1600, 40),
        'Руки до ліктя': (1000, 30),
        'Підмишки': (800, 20),
        'Живіт': (600, 20),
        'Лінія живота': (200, 10),
        'Сідниці': (400, 20),
        'Глибоке бікіні + підмишки': (2000, 50),
        'Глибоке бікіні + підмишки + ніжки з коліном': (3200, 80),
        'Глибоке бікіні + підмишки + ніжки з коліном + руки до ліктя': (3900, 100),
        'Глибоке бікіні + підмишки + ніжки повністю': (3500, 100),
        'Глибоке бікіні + підмишки + ніжки повністю + руки повністю': (4500, 110),
        'Глибоке бікіні + підмишки + ніжки повністю + руки до ліктя': (4300, 110),
    },
}
assert all(set(prices) == {item.name for item in ITEMS} for prices in PRICE_LISTS.values())


async def run(args):
    from fastapi import HTTPException
    from sqlalchemy import func, select
    from database import async_session_maker
    from dependencies import StudioContext
    from models import (
        Service, StaffBranchAssignment, StaffWorkingHours, Studio, StudioBranch, StudioMember, User,
        user_services,
    )
    from routers.staff.profiles import update_staff
    from schemas.settings.team import StaffUpdate

    if args.apply and args.studio_id is None:
        raise ValueError('Для записи обязателен --studio-id ID из предпросмотра.')
    price_list = PRICE_LISTS[args.price_list]
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
            print(f'  ID={candidate.id} | {candidate.name} | {candidate.currency}')
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

        by_name = {}
        for service in (await db.execute(select(Service).where(
                Service.studio_id == studio.id))).scalars().all():
            by_name.setdefault(normalized_name(service.name), []).append(service)
        missing = [name for name in price_list if len(by_name.get(normalized_name(name), [])) != 1]
        if missing:
            raise ValueError('В каталоге нет (или несколько) услуг: ' + '; '.join(missing) + '. Ничего не записано.')
        services = {name: by_name[normalized_name(name)][0] for name in price_list}
        current = dict((await db.execute(select(user_services.c.service_id, user_services.c.price).where(
            user_services.c.user_id == master.id,
            user_services.c.service_id.in_([s.id for s in services.values()]),
        ))).all())

        print(f'\n{"ЗАПИСЬ" if args.apply else "ПРЕДПРОСМОТР — без записи"}: '
              f'{member.name} {member.last_name or ""} ({master.email}, {member.role}) — прайс «{args.price_list}»')
        duration_notes = 0
        for name, (price, minutes) in price_list.items():
            service = services[name]
            now = ('не назначена' if service.id not in current
                   else f'сейчас {current[service.id] if current[service.id] is not None else service.price}')
            price_note = 'как в каталоге' if price == service.price else f'своя цена (каталог {service.price})'
            line = f'  {name} | {price} {studio.currency} — {price_note} | {now}'
            if minutes != service.duration_min:
                duration_notes += 1
                line += f' | ДЛИТЕЛЬНОСТЬ: в прайсе {minutes} мин, в системе остаётся {service.duration_min}'
            print(line)

        hours = (await db.execute(select(StaffWorkingHours).where(
            StaffWorkingHours.user_id == master.id, StaffWorkingHours.studio_id == studio.id,
        ).order_by(StaffWorkingHours.day_of_week))).scalars().all()
        schedule = build_schedule(args.days, args.hours) if args.days else [
            dict(day_of_week=h.day_of_week, is_open=h.is_open, open_time=h.open_time, close_time=h.close_time)
            for h in hours]
        branch_ids = list((await db.execute(select(StaffBranchAssignment.branch_id).where(
            StaffBranchAssignment.user_id == master.id, StaffBranchAssignment.studio_id == studio.id,
        ))).scalars().all()) or list((await db.execute(select(StudioBranch.id).where(
            StudioBranch.studio_id == studio.id))).scalars().all())
        days = 'Пн Вт Ср Чт Пт Сб Вс'.split()
        open_days = [f'{days[d["day_of_week"]]} {d["open_time"]}-{d["close_time"]}' for d in schedule if d['is_open']]
        print(f'  График: {", ".join(open_days) or "не задан"}' + (' (новый)' if args.days else ' (как сейчас)'))
        print(f'  Филиалы: {", ".join(map(str, branch_ids)) or "нет"}')
        if duration_notes:
            print(f'ВНИМАНИЕ: у {duration_notes} услуг длительность в прайсе другая. Своя длительность у мастера '
                  'в системе не хранится — слот займёт длительность из каталога.')
        if not open_days:
            print('ВНИМАНИЕ: графика нет — в онлайн-записи у мастера не будет свободного времени. Задайте --days/--hours.')
        if not branch_ids:
            print('ВНИМАНИЕ: у студии нет филиалов — индивидуальная запись к мастеру работать не будет.')

        # Services outside this price list stay assigned with their own prices: the card save
        # replaces the whole list and resets every personal price not sent back.
        others = dict((await db.execute(select(user_services.c.service_id, user_services.c.price).join(
            Service, Service.id == user_services.c.service_id,
        ).where(user_services.c.user_id == master.id, Service.studio_id == studio.id,
                Service.id.not_in([s.id for s in services.values()])))).all())
        service_ids = sorted({s.id for s in services.values()} | set(others))
        # Same Pydantic validation as PUT /staff/{id}, before any writes. Everything not about
        # services is sent back unchanged.
        data = StaffUpdate(
            name=member.name, last_name=member.last_name, email=master.email, phone=master.phone,
            department=member.department, salary=member.salary, rate=member.rate, rate_type=member.rate_type,
            photo_url=member.photo_url, service_ids=service_ids, schedule=schedule, branch_ids=branch_ids,
            service_prices=[dict(service_id=services[name].id, price=price)
                            for name, (price, _) in price_list.items() if price != services[name].price]
            + [dict(service_id=sid, price=price) for sid, price in others.items() if price is not None],
        )
        if not args.apply:
            command = ['docker', 'compose', 'exec', 'api', 'python', '-m', 'scripts.set_master_prices',
                       '--owner-email', owner.email, '--studio-id', str(studio.id),
                       '--staff-email', master.email, '--price-list', args.price_list]
            if args.days:
                command += ['--days', ','.join(map(str, args.days)), '--hours', args.hours]
            print('\nДля сохранения после проверки:')
            print(shlex.join(command + ['--apply']))
            return
        try:
            await update_staff(master.id, data, StudioContext(owner, studio.id, 'owner'), db)
        except HTTPException as error:
            raise ValueError(f'Отказ сервера: {error.detail}. Ничего не записано.')
        print(f'\nГОТОВО: {member.name} — {len(price_list)} услуг из прайса, всего своих цен: {len(data.service_prices)}.')


def int_list(value):
    return [int(part) for part in value.split(',') if part.strip()]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--owner-email', required=True)
    parser.add_argument('--studio-id', type=int)
    parser.add_argument('--staff-email', required=True, help='Мастер из команды студии (владелец тоже)')
    parser.add_argument('--price-list', required=True, choices=sorted(PRICE_LISTS))
    parser.add_argument('--days', type=int_list, default=[], help='Заменить график: дни 0=Пн … 6=Вс')
    parser.add_argument('--hours', default='10:00-19:00', help='Часы работы, ЧЧ:ММ-ЧЧ:ММ')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{2}:\d{2}-\d{2}:\d{2}', args.hours):
        parser.error('--hours в формате 10:00-19:00.')
    if any(not 0 <= day <= 6 for day in args.days):
        parser.error('--days: числа от 0 (Пн) до 6 (Вс).')
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
