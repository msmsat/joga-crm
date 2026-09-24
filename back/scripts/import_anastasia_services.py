"""Import Anastasiia's supplied price list with bundles. Preview by default; no external calls.

Bundles are catalog entries only: no master is assigned to them here.

From back/: python -m scripts.import_anastasia_services --owner-email EMAIL
Apply only after preview: add --studio-id ID --apply.
"""
import argparse
import asyncio
import shlex
import sys
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class Item:
    category: str
    name: str
    price: int
    duration_min: int
    parts: tuple = ()  # bundle composition by part name, in the order it is done

    def payload(self):
        return dict(name=self.name, category=self.category, price=self.price,
                    duration_min=self.duration_min, service_type='individual',
                    booking_mode='resource', max_clients=1, is_bookable=True,
                    buffer_before_min=0, buffer_after_min=0)


ITEMS = (
    Item('БІКІНІ', 'Класичне бікіні', 850, 30),
    Item('БІКІНІ', 'Глибоке бікіні', 1300, 40),
    Item('НІЖКИ', 'Ніжки повністю', 1800, 50),
    Item('НІЖКИ', 'Ніжки з коліном', 1300, 30),
    Item('НІЖКИ', 'Ніжки вище коліна', 1300, 40),
    Item('РУКИ', 'Руки повністю', 1400, 40),
    Item('РУКИ', 'Руки до ліктя', 900, 30),
    Item('РУКИ', 'Підмишки', 650, 20),
    Item('ДОДАТКОВІ ЗОНИ', 'Живіт', 600, 20),
    Item('ДОДАТКОВІ ЗОНИ', 'Лінія живота', 200, 10),
    Item('ДОДАТКОВІ ЗОНИ', 'Сідниці', 400, 30),
    Item('КОМПЛЕКСИ', 'Глибоке бікіні + підмишки', 1700, 50,
         ('Глибоке бікіні', 'Підмишки')),
    Item('КОМПЛЕКСИ', 'Глибоке бікіні + підмишки + ніжки з коліном', 2800, 90,
         ('Глибоке бікіні', 'Підмишки', 'Ніжки з коліном')),
    Item('КОМПЛЕКСИ', 'Глибоке бікіні + підмишки + ніжки з коліном + руки до ліктя', 3500, 110,
         ('Глибоке бікіні', 'Підмишки', 'Ніжки з коліном', 'Руки до ліктя')),
    Item('КОМПЛЕКСИ', 'Глибоке бікіні + підмишки + ніжки повністю', 3100, 110,
         ('Глибоке бікіні', 'Підмишки', 'Ніжки повністю')),
    Item('КОМПЛЕКСИ', 'Глибоке бікіні + підмишки + ніжки повністю + руки повністю', 4250, 130,
         ('Глибоке бікіні', 'Підмишки', 'Ніжки повністю', 'Руки повністю')),
    Item('КОМПЛЕКСИ', 'Глибоке бікіні + підмишки + ніжки повністю + руки до ліктя', 4000, 120,
         ('Глибоке бікіні', 'Підмишки', 'Ніжки повністю', 'Руки до ліктя')),
)
# Parts must be plain items of this list: a typo would otherwise surface only on --apply.
assert all(part in {i.name for i in ITEMS if not i.parts} for i in ITEMS for part in i.parts)


def normalized_name(name):
    return ' '.join(unicodedata.normalize('NFKC', name).casefold().split())


def plan_import(existing):
    """Matching names with different values block the entire batch; never overwrite."""
    by_name = {}
    for service in existing:
        by_name.setdefault(normalized_name(service.name), []).append(service)
    plan = []
    for item in ITEMS:
        matches = by_name.get(normalized_name(item.name), [])
        if not matches:
            plan.append(('ADD', item, ''))
        elif len(matches) > 1:
            plan.append(('CONFLICT', item, 'в каталоге несколько услуг с таким названием'))
        else:
            differences = [key for key, value in item.payload().items()
                           if key != 'name' and getattr(matches[0], key) != value]
            plan.append(('CONFLICT' if differences else 'SKIP', item, ', '.join(differences)))
    return plan


def choose_studio(studios, studio_id):
    if studio_id is not None:
        selected = next((studio for studio in studios if studio.id == studio_id), None)
        if selected is None:
            raise ValueError('Этот ID не принадлежит активным студиям указанного владельца.')
        return selected
    if len(studios) != 1:
        raise ValueError('Укажите --studio-id ID из списка выше; автоматического выбора нет.')
    return studios[0]


async def run(owner_email, studio_id=None, apply=False):
    from sqlalchemy import func, select
    from database import async_session_maker
    from models import Service, Studio, StudioMember, User
    from schemas.studio import ServiceCreate
    from routers.studio.services import _assert_mode_available, _normalize_category
    from services import service_bundles
    from routers.settings.general import bump_booking_config_version
    from services.schedule_guard import lock_studio

    if apply and studio_id is None:
        raise ValueError('Для записи обязателен --studio-id ID из предпросмотра.')
    # Same Pydantic validation as POST /studio/services, before any writes.
    payloads = {item.name: ServiceCreate(**item.payload()) for item in ITEMS}
    async with async_session_maker() as db:
        async with db.begin():
            user = (await db.execute(select(User).where(
                func.lower(func.trim(User.email)) == owner_email.strip().lower(),
            ))).scalar_one_or_none()
            if user is None:
                raise ValueError('Аккаунт с таким email не найден. Ничего не записано.')
            studios = list((await db.execute(select(Studio).join(
                StudioMember, StudioMember.studio_id == Studio.id,
            ).where(StudioMember.user_id == user.id, StudioMember.role == 'owner',
                    StudioMember.status == 'active').order_by(Studio.id))).scalars().all())
            print(f'Владелец: {user.email}')
            for candidate in studios:
                print(f'  ID={candidate.id} | {candidate.name} | {candidate.currency}')
            if not studios:
                raise ValueError('У аккаунта нет активного членства владельца студии.')
            studio = choose_studio(studios, studio_id)
            # Same lock as catalog writes: parallel imports cannot create duplicates.
            if apply:
                studio = await lock_studio(db, studio.id)
            existing = list((await db.execute(select(Service).where(
                Service.studio_id == studio.id,
            ))).scalars().all())
            plan = plan_import(existing)
            print(f'\n{"ЗАПИСЬ" if apply else "ПРЕДПРОСМОТР — без записи"}: {studio.name} (ID {studio.id})')
            print(f'Валюта: {studio.currency}; режим: {studio.booking_mode}; '
                  f'строгое расписание: {studio.strict_schedule_enabled}')
            for action, item, reason in plan:
                print(f'{action:8} | {item.category} | {item.name} | {item.price} CZK | '
                      f'{item.duration_min} мин' + (f' | {reason}' if reason else ''))
                if item.parts:
                    print(f'{"":8} |   состав: {" → ".join(item.parts)}')
            errors = []
            if (studio.currency or '').upper() != 'CZK':
                errors.append('Валюта студии должна быть CZK. Валюта и цены существующих услуг не изменены.')
            if not studio.strict_schedule_enabled:
                errors.append('Для индивидуальных услуг сначала включите строгое расписание через настройки CRM.')
            if studio.booking_mode not in ('resource', 'hybrid'):
                errors.append('В настройках студии нужен индивидуальный или смешанный режим записи.')
            if any(action == 'CONFLICT' for action, _, _ in plan):
                errors.append('Есть совпадающие названия с другими значениями. Сначала разберите CONFLICT.')
            added = sum(action == 'ADD' for action, _, _ in plan)
            skipped = sum(action == 'SKIP' for action, _, _ in plan)
            print(f'\nК добавлению: {added}; уже существуют без изменений: {skipped}.')
            if errors:
                for error in errors:
                    print('СТОП: ' + error)
                raise ValueError('Импорт заблокирован. Ни одна услуга не записана.')
            _assert_mode_available('resource', studio)
            if not apply:
                print('\nДля сохранения после проверки:')
                print('docker compose exec api python -m scripts.import_anastasia_services '
                      f'--owner-email {shlex.quote(user.email)} --studio-id {studio.id} --apply')
                return
            by_name = {normalized_name(service.name): service for service in existing}
            # Plain services first: bundle parts must exist before the bundle refers to them.
            for action, item, _ in sorted(plan, key=lambda row: bool(row[1].parts)):
                if action != 'ADD':
                    continue
                fields = payloads[item.name].model_dump()
                fields.pop('bundle_service_ids', None)  # schema-only field, as in create_service
                fields['category'] = await _normalize_category(fields['category'], studio.id, db)
                service = Service(studio_id=studio.id, **fields)
                db.add(service)
                await db.flush()
                by_name[normalized_name(item.name)] = service
                if item.parts:
                    # Same composition rules as POST /studio/services; no assign_masters on purpose.
                    part_ids = await service_bundles.validate_parts(
                        db, studio.id, [by_name[normalized_name(part)].id for part in item.parts])
                    await service_bundles.set_parts(db, service.id, part_ids)
            if added:
                await bump_booking_config_version(db, studio)
                await db.flush()
        # Print success only after the transaction committed.
        print(f'\nГОТОВО: добавлено {added}, пропущено {skipped}. Студия ID={studio.id}.')
        print('Каталог заполнен. Назначение услуг и комплексов мастеру, филиал и рабочие часы здесь не менялись.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner-email', help='Email владельца; без флага запросим интерактивно')
    parser.add_argument('--studio-id', type=int)
    parser.add_argument('--apply', action='store_true', help='Записать после проверки предпросмотра')
    args = parser.parse_args()
    email = (args.owner_email or input('Email владельца студии: ')).strip()
    if not email or '@' not in email:
        parser.error('Нужен полный email владельца.')
    try:
        asyncio.run(run(email, args.studio_id, args.apply))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception as error:
        # Do not print a connection URL, credentials or raw database errors.
        print(f'Ошибка ({type(error).__name__}). Успешное завершение не подтверждено; '
              'перед повтором выполните предпросмотр. Проверьте окружение и настройки сервера.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
