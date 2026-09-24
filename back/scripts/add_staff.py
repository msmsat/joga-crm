"""Add a staff member to a client's studio on the owner's behalf. Preview by default.

Runs the same code as the "Add staff" button (POST /staff/): plan limit, studio lock,
pending membership, invite email to the staff member, notification to the owner.

From back/:
  python -m scripts.add_staff --owner-email OWNER --email STAFF --name NAME --percent 30 \
      --days 0,1,2,3,4 --hours 10:00-19:00
Apply only after preview: add --studio-id ID --apply.
"""
import argparse
import asyncio
import re
import secrets
import shlex
import sys

from scripts.import_anastasia_services import choose_studio


def generate_password():
    from schemas.auth.requests import validate_strong_password
    while True:
        candidate = secrets.token_urlsafe(9) + str(secrets.randbelow(10))
        try:
            return validate_strong_password(candidate)
        except ValueError:
            continue


def build_schedule(days, hours):
    """0=Mon … 6=Sun; every day is sent, like the staff form does."""
    if not days:
        return []
    open_time, close_time = hours.split('-')
    return [dict(day_of_week=day, is_open=day in days, open_time=open_time, close_time=close_time)
            for day in range(7)]


async def run(args):
    from fastapi import HTTPException
    from sqlalchemy import func, select
    from database import async_session_maker
    from dependencies import StudioContext
    from models import Service, ServiceBundleItem, Studio, StudioBranch, StudioMember, User
    from routers.staff.profiles import create_staff
    from schemas.settings.team import StaffCreate
    from services.contacts import normalize, normalized_column
    from services.plan_limits import check_plan_limit

    if args.apply and args.studio_id is None:
        raise ValueError('Для записи обязателен --studio-id ID из предпросмотра.')
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

        team = (await db.execute(select(StudioMember, User).join(
            User, User.id == StudioMember.user_id,
        ).where(StudioMember.studio_id == studio.id).order_by(StudioMember.id))).all()
        print(f'\nКоманда студии {studio.name} (ID {studio.id}):')
        for member, user in team:
            print(f'  {member.role:8} | {member.status:8} | {member.name} {member.last_name or ""} | {user.email}')

        existing = (await db.execute(select(User).where(
            normalized_column(User, 'email') == normalize('email', args.email),
        ))).scalars().first()
        if existing is not None and any(user.id == existing.id for _, user in team):
            raise ValueError('Этот человек уже в команде студии. Ничего не записано.')

        if args.service_ids:
            service_ids = args.service_ids
            services = list((await db.execute(select(Service).where(
                Service.id.in_(service_ids), Service.studio_id == studio.id,
            ))).scalars().all())
        else:
            # Individual (resource) services only: group classes stay with whoever runs them.
            # Bundles too are left out: who does a bundle is the owner's call, pass --service-ids.
            services = list((await db.execute(select(Service).where(
                Service.studio_id == studio.id, Service.booking_mode == 'resource',
                Service.id.not_in(select(ServiceBundleItem.bundle_id)),
            ).order_by(Service.id))).scalars().all())
            service_ids = [service.id for service in services]
        branches = list((await db.execute(select(StudioBranch).where(
            StudioBranch.studio_id == studio.id,
        ).order_by(StudioBranch.id))).scalars().all())
        schedule = build_schedule(args.days, args.hours)

        print(f'\n{"ЗАПИСЬ" if args.apply else "ПРЕДПРОСМОТР — без записи"}:')
        print(f'  {args.name} {args.last_name or ""} | {args.email} | роль {args.role} | '
              f'{args.percent:g}% от выручки своих услуг')
        print('  Аккаунт: ' + ('уже есть — войдёт своим паролем' if existing else
                               'новый — пароль сгенерируем, передать лично'))
        print(f'  Услуги ({len(services)}):')
        for service in services:
            print(f'    ID={service.id} | {service.category or "-"} | {service.name} | '
                  f'{service.price} {studio.currency} | {service.duration_min} мин')
        print('  Филиалы: ' + (', '.join(f'ID={b.id} {b.name}' for b in branches) or 'нет'))
        print('  График: ' + (f'дни {",".join(map(str, args.days))} (0=Пн), {args.hours}'
                              if schedule else 'не задан'))

        warnings = []
        if not services:
            warnings.append('Услуг нет — сначала импорт каталога, иначе записаться к мастеру не на что.')
        if not branches:
            warnings.append('У студии нет филиалов — индивидуальная запись к мастеру работать не будет.')
        if not schedule:
            warnings.append('График не задан — в онлайн-записи у мастера не будет свободного времени.')
        for warning in warnings:
            print('ВНИМАНИЕ: ' + warning)
        # Same Pydantic validation as POST /staff/, before any writes.
        password = None if existing else generate_password()
        data = StaffCreate(
            name=args.name, last_name=args.last_name, email=args.email, password=password,
            role=args.role, rate=args.percent, rate_type='percent',
            service_ids=service_ids, branch_ids=[b.id for b in branches], schedule=schedule,
        )
        try:
            await check_plan_limit(db, studio.id, 'staff')
        except HTTPException as error:
            raise ValueError(f'Тариф студии не пускает нового сотрудника: {error.detail}')

        if not args.apply:
            command = ['docker', 'compose', 'exec', 'api', 'python', '-m', 'scripts.add_staff',
                       '--owner-email', owner.email, '--studio-id', str(studio.id),
                       '--email', args.email, '--name', args.name, '--percent', f'{args.percent:g}',
                       '--role', args.role]
            if service_ids:
                command += ['--service-ids', ','.join(map(str, service_ids))]
            if args.last_name:
                command += ['--last-name', args.last_name]
            if schedule:
                command += ['--days', ','.join(map(str, args.days)), '--hours', args.hours]
            print('\nДля сохранения после проверки:')
            print(shlex.join(command + ['--apply']))
            return

        # Same session: create_staff takes the studio lock and commits by itself.
        try:
            result = await create_staff(data, StudioContext(owner, studio.id, 'owner'), db)
        except HTTPException as error:
            raise ValueError(f'Отказ сервера: {error.detail}. Ничего не записано.')
        print(f'\nГОТОВО: {args.name} добавлена в студию ID={studio.id} (ждёт принятия приглашения).')
        print(f'Ссылка-приглашение (ушла письмом на {args.email}): {result["invite_url"]}')
        if password:
            print(f'Пароль для входа по ссылке — передать лично, не письмом: {password}')


def int_list(value):
    return [int(part) for part in value.split(',') if part.strip()]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--owner-email', required=True)
    parser.add_argument('--studio-id', type=int)
    parser.add_argument('--email', required=True, help='Email сотрудника — на него уйдёт приглашение')
    parser.add_argument('--name', required=True)
    parser.add_argument('--last-name')
    parser.add_argument('--role', choices=('trainer', 'admin'), default='trainer')
    parser.add_argument('--percent', type=float, required=True, help='Доля мастера от выручки его услуг, %%')
    parser.add_argument('--service-ids', type=int_list, help='По умолчанию — все индивидуальные услуги, кроме комплексов')
    parser.add_argument('--days', type=int_list, default=[], help='Рабочие дни, 0=Пн … 6=Вс, через запятую')
    parser.add_argument('--hours', default='10:00-19:00', help='Часы работы, ЧЧ:ММ-ЧЧ:ММ')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if '@' not in args.email or '@' not in args.owner_email:
        parser.error('Нужны полные email владельца и сотрудника.')
    if not 0 < args.percent <= 100:
        parser.error('--percent должен быть от 0 до 100.')
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
