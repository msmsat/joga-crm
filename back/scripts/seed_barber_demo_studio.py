"""Create one complete, realistic barbershop demo studio for demos.

Second demo studio рядом с AURA (`seed_aura_demo_studio.py`), но другой механики:
AURA продаёт групповые занятия по расписанию (`booking_mode="event"`), барбершоп —
индивидуальные услуги по свободному времени мастера (`booking_mode="resource"`,
docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md). Поэтому здесь не «то же самое с
другими словами», а другой набор данных: кресло вместо зала, вместимость 1, у
каждой записи свой интервал, буфер после услуги, назначение мастера на филиал и
строгое расписание.

Данные пишутся так, чтобы конфигурация проходила аудит HB-24:
у каждого интервала есть зона, филиал и мастер; у мастера — часы и назначение на
филиал; пересечений по мастеру и по креслу нет. Проверка после прогона:

    cd back && python -m scripts.hybrid_booking_audit --studio-id <id>

Скрипт только добавляет: он создаёт новую студию и ничего не меняет и не удаляет.
Повторный запуск при уже существующем демо отказывает. Запуск из корня репозитория:

    python back/scripts/seed_barber_demo_studio.py --apply

Все суммы — в кронах (CZK), валюта студии.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path

from sqlalchemy import select

# Позволяет документированный запуск `python back/scripts/...py` из корня
# репозитория: Python сам кладёт в sys.path только back/scripts, а приложение
# импортирует `models`, `services` и `database` как модули верхнего уровня back.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACK_ROOT = PROJECT_ROOT / "back"
if str(BACK_ROOT) not in sys.path:
    sys.path.insert(0, str(BACK_ROOT))

from database import async_session_maker
from models import (
    Account,
    BranchWorkingHours,
    Client,
    ClientLoyaltyCard,
    ClientPayment,
    ClientSubscription,
    Counterparty,
    FinDocument,
    FinancialGoal,
    Hall,
    Lesson,
    LoyaltyLevel,
    Operation,
    PaymentMethodConfig,
    Reservation,
    SalaryPayment,
    Service,
    StaffBranchAssignment,
    StaffBusyInterval,
    StaffWorkingHours,
    Studio,
    StudioAISettings,
    StudioBillingPlan,
    StudioBookingSettings,
    StudioBranch,
    StudioLoyaltyConfig,
    StudioMember,
    StudioSubscriptionProgramConfig,
    StudioWorkingHours,
    SubscriptionPackage,
    User,
    user_services,
)
from security import get_password_hash


STUDIO_NAME = "FIGARO Barber Club · Demo"
STUDIO_EMAIL = "hello@figaro-demo.cz"
PASSWORD = "DemoOnly-ChangeMe-2026"
TZ = "Europe/Prague"
RNG = random.Random(20260911)

# Прошлое кормит отчёты и зарплаты, будущее — журнал и онлайн-запись.
# История начинается ПЕРВЫМ ЧИСЛОМ месяца `HISTORY_MONTHS - 1` назад, а не
# «N дней назад»: расходы и выплаты ниже заводятся помесячно, и любой сдвиг
# даёт месяц с выручкой без расходов (или наоборот) — на графике это выброс,
# а не бизнес.
HISTORY_MONTHS = 3
FUTURE_DAYS = 14

# Настоящие редакционные фотографии Unsplash (проверены запросом, 200/image).
PHOTOS = {
    "cover": "https://images.unsplash.com/photo-1536520002442-39764a41e987?auto=format&fit=crop&w=1600&q=85",
    "hall_1": "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1400&q=85",
    "hall_2": "https://images.unsplash.com/photo-1621645582931-d1d3e6564943?auto=format&fit=crop&w=1400&q=85",
    "hall_3": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1400&q=85",
    "hall_4": "https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=1400&q=85",
    "master_1": "https://images.unsplash.com/photo-1553521041-d168abd31de3?auto=format&fit=crop&w=720&q=85",
    "master_2": "https://images.unsplash.com/photo-1512864084360-7c0c4d0a0845?auto=format&fit=crop&w=720&q=85",
    "master_3": "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=720&q=85",
    "master_4": "https://images.unsplash.com/photo-1605497788044-5a32c7078486?auto=format&fit=crop&w=720&q=85",
    "master_5": "https://images.unsplash.com/photo-1593702275687-f8b402bf1fb5?auto=format&fit=crop&w=720&q=85",
    "master_6": "https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&w=720&q=85",
    "master_7": "https://images.unsplash.com/photo-1647140655214-e4a2d914971f?auto=format&fit=crop&w=720&q=85",
}

BRANCHES = (
    ("Staré Město", "Dlouhá 12, Praha 1", "110 00", PHOTOS["hall_1"]),
    ("Karlín", "Sokolovská 94, Praha 8", "186 00", PHOTOS["hall_2"]),
)

# Кресло — «зал» вместимостью 1. Своё кресло у каждого штатного мастера; девятый,
# подменный, работает без закреплённого кресла (у его записей hall_id = NULL).
CHAIRS = (
    ("Staré Město", "Кресло 1 · Staré Město", "#B87333", PHOTOS["hall_1"]),
    ("Staré Město", "Кресло 2 · Staré Město", "#8C6A4A", PHOTOS["hall_3"]),
    ("Staré Město", "Кресло 3 · Staré Město", "#A9744F", PHOTOS["hall_4"]),
    ("Staré Město", "Кресло 4 · Staré Město", "#6E5849", PHOTOS["hall_1"]),
    ("Karlín", "Кресло 1 · Karlín", "#B87333", PHOTOS["hall_2"]),
    ("Karlín", "Кресло 2 · Karlín", "#8C6A4A", PHOTOS["hall_3"]),
    ("Karlín", "Кресло 3 · Karlín", "#A9744F", PHOTOS["hall_4"]),
    ("Karlín", "Кресло 4 · Karlín", "#6E5849", PHOTOS["hall_2"]),
)

# name, description, price, duration_min, buffer_after_min, category, color, вес в спросе
SERVICES = (
    ("Классическая стрижка", "Стрижка ножницами с укладкой и горячим полотенцем.", 650, 45, 10, "Стрижка", "#B87333", 26),
    ("Фейд машинкой", "Чистый переход от кожи, финиш ножницами и стайлинг.", 590, 40, 10, "Стрижка", "#C08A5A", 22),
    ("Стрижка и борода", "Полный формат: голова, борода, контуры и уход.", 950, 75, 15, "Комбо", "#8C6A4A", 16),
    ("Моделирование бороды", "Форма, контуры опасной бритвой, масло и бальзам.", 450, 30, 10, "Борода", "#A9744F", 13),
    ("Королевское бритьё", "Классическое бритьё опасной бритвой с компрессами.", 700, 45, 15, "Бритьё", "#7E5A44", 7),
    ("Детская стрижка", "До 12 лет — спокойно, быстро и без слёз.", 400, 30, 10, "Стрижка", "#D2A679", 6),
    ("Отец и сын", "Две стрижки подряд в одном кресле, со скидкой.", 900, 60, 10, "Комбо", "#9C7B5C", 4),
    ("Камуфляж седины", "Мягкое тонирование седины без эффекта краски.", 550, 40, 10, "Уход", "#6E5849", 3),
    ("Укладка и мытьё", "Мытьё, массаж головы и укладка перед выходом.", 250, 20, 5, "Уход", "#C9B29B", 3),
)

# name, last_name, department, услуги, фото, филиал, кресло (None — подменный мастер)
MASTERS = (
    ("Tomáš", "Bárta", "Master Barber", ("Классическая стрижка", "Стрижка и борода", "Королевское бритьё"),
     PHOTOS["master_1"], "Staré Město", "Кресло 1 · Staré Město"),
    ("Marek", "Šindelář", "Senior Barber", ("Фейд машинкой", "Классическая стрижка", "Камуфляж седины"),
     PHOTOS["master_2"], "Staré Město", "Кресло 2 · Staré Město"),
    ("David", "Kohout", "Barber", ("Фейд машинкой", "Детская стрижка", "Отец и сын"),
     PHOTOS["master_3"], "Staré Město", "Кресло 3 · Staré Město"),
    ("Vojtěch", "Hruška", "Barber & Shaver", ("Королевское бритьё", "Моделирование бороды", "Укладка и мытьё"),
     PHOTOS["master_4"], "Staré Město", "Кресло 4 · Staré Město"),
    ("Filip", "Novák", "Master Barber", ("Классическая стрижка", "Стрижка и борода", "Укладка и мытьё"),
     PHOTOS["master_5"], "Karlín", "Кресло 1 · Karlín"),
    # Каждая услуга обязана иметь мастера в ОБОИХ филиалах: иначе онлайн-запись
    # честно отвечает «нет мастеров» и услуга во втором филиале не продаётся.
    ("Adam", "Zeman", "Junior Barber", ("Детская стрижка", "Фейд машинкой", "Отец и сын", "Укладка и мытьё"),
     PHOTOS["master_6"], "Karlín", "Кресло 2 · Karlín"),
    ("Petr", "Vlk", "Senior Barber", ("Стрижка и борода", "Моделирование бороды", "Королевское бритьё", "Классическая стрижка"),
     PHOTOS["master_7"], "Karlín", "Кресло 3 · Karlín"),
    ("Lukáš", "Beran", "Barber", ("Классическая стрижка", "Камуфляж седины", "Фейд машинкой"),
     PHOTOS["master_1"], "Karlín", "Кресло 4 · Karlín"),
    ("Ondřej", "Maršík", "Barber · подмена", ("Фейд машинкой", "Детская стрижка", "Классическая стрижка"),
     PHOTOS["master_2"], "Staré Město", None),
)

OWNER = ("Radek", "Hošek", "Founder", PHOTOS["master_3"])
ADMIN = ("Klára", "Hájková", "Администратор", None)

CLIENTS = (
    ("Jan", "Novák"), ("Petr", "Svoboda"), ("Josef", "Novotný"), ("Martin", "Dvořák"),
    ("Tomáš", "Černý"), ("Jaroslav", "Procházka"), ("Miroslav", "Kučera"), ("Zdeněk", "Veselý"),
    ("Václav", "Horák"), ("Michal", "Němec"), ("Pavel", "Marek"), ("Jiří", "Pospíšil"),
    ("Lukáš", "Pokorný"), ("David", "Hájek"), ("Ondřej", "Král"), ("Filip", "Jelínek"),
    ("Jakub", "Růžička"), ("Adam", "Beneš"), ("Matěj", "Fiala"), ("Vojtěch", "Sedláček"),
    ("Daniel", "Doležal"), ("Radek", "Zeman"), ("Marek", "Kolář"), ("Roman", "Navrátil"),
    ("Karel", "Čermák"), ("Milan", "Vaněk"), ("Libor", "Bartoš"), ("Štěpán", "Kopecký"),
    ("Dominik", "Musil"), ("Patrik", "Šimek"), ("Vít", "Konečný"), ("Aleš", "Malý"),
    ("Igor", "Holub"), ("Robert", "Štěpánek"), ("Erik", "Kadlec"), ("Šimon", "Vlček"),
    ("Antonín", "Blažek"), ("Bohumil", "Bureš"), ("Kryštof", "Urban"), ("Oliver", "Mareš"),
    ("Sebastian", "Kříž"), ("Maxim", "Hruška"), ("Denis", "Vávra"), ("Artem", "Sýkora"),
    ("Nikita", "Říha"), ("Emil", "Šťastný"), ("Hugo", "Polák"), ("Viktor", "Tichý"),
    ("Alex", "Kovář"), ("Ivan", "Bláha"),
    ("Tereza", "Hájková"), ("Klára", "Pavlíková"), ("Nikola", "Bednářová"),
    ("Simona", "Matoušková"), ("Andrea", "Kratochvílová"),
)

# name, class_count, price, duration_days, услуги (None — любая), sold_single, sold_subscription
PACKAGES = (
    ("Пакет · 5 стрижек", 5, 2_900, 120, ("Классическая стрижка", "Фейд машинкой"), False, True),
    ("Борода на месяц · 4 визита", 4, 1_600, 35, ("Моделирование бороды",), False, True),
    ("Полный уход · 4 визита", 4, 3_400, 90, ("Стрижка и борода",), False, True),
    ("Королевский набор · 3 бритья", 3, 1_890, 90, ("Королевское бритьё",), False, True),
    ("Отец и сын · 4 визита", 4, 3_200, 120, ("Отец и сын", "Детская стрижка"), False, True),
    ("Подарочный сертификат · 1 визит", 1, 950, 180, None, True, False),
)

# Часы студии и филиалов: воскресенье закрыто. Часы мастеров ниже — внутри них.
STUDIO_HOURS = {**{day: ("09:00", "21:00") for day in range(5)}, 5: ("10:00", "20:00")}
MASTER_HOURS = {**{day: ("09:00", "20:00") for day in range(5)}, 5: ("10:00", "19:00")}


def _hours(day: int) -> tuple[bool, str, str]:
    open_time, close_time = STUDIO_HOURS.get(day, ("10:00", "18:00"))
    return day in STUDIO_HOURS, open_time, close_time


def _minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def _at(day: date, minute_of_day: int) -> datetime:
    return datetime.combine(day, time.min) + timedelta(minutes=minute_of_day)


def _month_start(value: date, months_back: int) -> date:
    month, year = value.month - months_back, value.year
    while month <= 0:
        month, year = month + 12, year - 1
    return date(year, month, 1)


def _month_end(value: date) -> date:
    if value.month == 12:
        return date(value.year + 1, 1, 1) - timedelta(days=1)
    return date(value.year, value.month + 1, 1) - timedelta(days=1)


async def seed() -> dict[str, int]:
    today = date.today()
    history_days = (today - _month_start(today, HISTORY_MONTHS - 1)).days
    async with async_session_maker() as session:
        async with session.begin():
            exists = await session.scalar(select(Studio.id).where(Studio.email == STUDIO_EMAIL))
            if exists:
                raise RuntimeError(
                    "FIGARO demo already exists. It was not modified; delete it manually only if you want a fresh demo."
                )

            studio = Studio(
                name=STUDIO_NAME,
                phone="+420 222 314 090",
                business_type="beauty",
                business_subtype="barbershop",
                description=(
                    "Два барбершопа в центре Праги: стрижки, борода и бритьё опасной бритвой. "
                    "Запись к своему мастеру на удобное время, без групп и без расписания."
                ),
                email=STUDIO_EMAIL,
                website="https://figaro-demo.cz",
                address="Dlouhá 12, Praha 1",
                country="CZ",
                postal_code="110 00",
                city="Prague",
                logo_url=PHOTOS["cover"],
                timezone="UTC+2",
                tz_iana=TZ,
                language="cs",
                currency="CZK",
                date_format="DD.MM.YYYY",
                first_day_of_week="monday",
                journal_time_step=15,
                # Механика записи барбершопа: клиент выбирает услугу, мастера и
                # время. Строгое расписание обязательно для resource — на нём
                # держится запрет пересечений мастера и кресла.
                booking_mode="resource",
                terminology_profile="beauty",
                strict_schedule_enabled=True,
            )
            session.add(studio)
            await session.flush()

            for day in range(7):
                is_open, open_time, close_time = _hours(day)
                session.add(StudioWorkingHours(
                    studio_id=studio.id, day_of_week=day, is_open=is_open,
                    open_time=open_time, close_time=close_time,
                ))

            session.add(StudioBillingPlan(
                studio_id=studio.id,
                plan_name="s12",
                billing_cycle="monthly",
                status="active",
                expires_at=datetime.combine(today + timedelta(days=365), time.min),
                max_staff=12,
            ))
            session.add(StudioBookingSettings(
                studio_id=studio.id,
                booking_active=True,
                prefill_on_booking=True,
                min_booking_advance_min=60,
                booking_window_days=21,
                cancellation_deadline_min=120,
                widget_accent_color="#B87333",
                widget_logo_url=PHOTOS["cover"],
                widget_language="cs",
                widget_work_start="09:00",
                widget_work_end="21:00",
                miniapp_generated=True,
                trial_lesson_free=False,
                # «Кофе после занятия» — механика группы: у индивидуальной
                # записи компании не бывает, и сервер её для resource гасит.
                coffee_enabled=False,
                coffee_spots=None,
            ))
            session.add(StudioAISettings(
                studio_id=studio.id,
                language="cs",
                system_prompt=(
                    "Jsi asistent barbershopu FIGARO. Odpovídej krátce, věcně a přátelsky. "
                    "Pomoz vybrat službu a barbera, najít volný termín, vysvětlit ceny a balíčky. "
                    "Složitou nebo citlivou žádost předej živému týmu."
                ),
                tg_enabled=False,
                ig_enabled=False,
                wa_enabled=False,
                tg_tone="friendly",
                ig_tone="friendly",
                wa_tone="friendly",
            ))

            branches: dict[str, StudioBranch] = {}
            for name, address, _postal_code, photo_url in BRANCHES:
                branch = StudioBranch(
                    studio_id=studio.id,
                    name=name,
                    phone="+420 222 314 090",
                    email=f"{'stare' if name.startswith('Star') else 'karlin'}@figaro-demo.cz",
                    address=address,
                    country="CZ",
                    city="Prague",
                    photo_url=photo_url,
                )
                session.add(branch)
                branches[name] = branch
            await session.flush()

            for branch in branches.values():
                for day in range(7):
                    is_open, open_time, close_time = _hours(day)
                    session.add(BranchWorkingHours(
                        branch_id=branch.id, day_of_week=day, is_open=is_open,
                        open_time=open_time, close_time=close_time,
                    ))

            chairs: dict[str, Hall] = {}
            for branch_name, name, color, photo_url in CHAIRS:
                chair = Hall(
                    studio_id=studio.id,
                    branch_id=branches[branch_name].id,
                    name=name,
                    capacity=1,
                    area=6,
                    equipment=["кресло", "зеркало", "машинки", "стерилизатор"],
                    hourly_rate=0,
                    color=color,
                    photo_url=photo_url,
                )
                session.add(chair)
                chairs[name] = chair

            services: dict[str, Service] = {}
            weights: dict[str, int] = {}
            for name, description, price, duration, buffer_after, category, color, weight in SERVICES:
                service = Service(
                    studio_id=studio.id,
                    name=name,
                    description=description,
                    price=price,
                    duration_min=duration,
                    category=category,
                    service_type="individual",
                    color=color,
                    max_clients=1,
                    booking_mode="resource",
                    buffer_after_min=buffer_after,
                    is_bookable=True,
                )
                session.add(service)
                services[name] = service
                weights[name] = weight
            await session.flush()

            # ── Команда ───────────────────────────────────────────────────────
            owner_user = User(
                email="figaro.demo.owner@example.invalid",
                hashed_password=get_password_hash(PASSWORD),
                name=OWNER[0], last_name=OWNER[1],
                phone="+420 777 200 001",
                photo_url=OWNER[3],
                is_verified=True, is_onboarded=True,
                language="cs", accent_color="#B87333",
            )
            admin_user = User(
                email="figaro.demo.admin@example.invalid",
                hashed_password=get_password_hash(PASSWORD),
                name=ADMIN[0], last_name=ADMIN[1],
                phone="+420 777 200 002",
                is_verified=True, is_onboarded=True,
                language="cs", accent_color="#B87333",
            )
            session.add_all([owner_user, admin_user])

            masters: list[User] = []
            for index, (name, last_name, _department, _service_names, photo_url, _branch, _chair) in enumerate(MASTERS, start=1):
                master = User(
                    email=f"figaro.demo.master{index}@example.invalid",
                    hashed_password=get_password_hash(PASSWORD),
                    name=name, last_name=last_name,
                    phone=f"+420 777 200 {100 + index:03d}",
                    photo_url=photo_url,
                    avg_rating=round(RNG.uniform(4.6, 5.0), 1),
                    is_verified=True, is_onboarded=True,
                    language="cs", accent_color="#B87333",
                )
                session.add(master)
                masters.append(master)
            await session.flush()

            session.add(StudioMember(
                user_id=owner_user.id, studio_id=studio.id, role="owner", status="active",
                name=OWNER[0], last_name=OWNER[1], photo_url=OWNER[3], department=OWNER[2],
                salary=0, rate=0, rate_type="fixed",
            ))
            session.add(StudioMember(
                user_id=admin_user.id, studio_id=studio.id, role="admin", status="active",
                name=ADMIN[0], last_name=ADMIN[1], photo_url=ADMIN[3], department=ADMIN[2],
                salary=38_000, rate=38_000, rate_type="fixed",
            ))

            # Выходной у каждого мастера свой, в воскресенье закрыт весь клуб.
            days_off = {index: index % 5 for index in range(len(MASTERS))}
            for index, (name, last_name, department, service_names, photo_url, branch_name, chair_name) in enumerate(MASTERS):
                master = masters[index]
                session.add(StudioMember(
                    user_id=master.id, studio_id=studio.id, role="trainer", status="active",
                    name=name, last_name=last_name, photo_url=photo_url, department=department,
                    # Мастер барбершопа работает за процент от своей выручки —
                    # `_compute_amount` в routers/finances/salary.py считает так же.
                    salary=0, rate=45, rate_type="percent",
                ))
                await session.execute(user_services.insert(), [
                    {"user_id": master.id, "service_id": services[service_name].id}
                    for service_name in service_names
                ])
                session.add(StaffBranchAssignment(
                    studio_id=studio.id, user_id=master.id, branch_id=branches[branch_name].id,
                ))
                for day in range(7):
                    works = day in MASTER_HOURS and days_off[index] != day
                    open_time, close_time = MASTER_HOURS.get(day, ("10:00", "18:00"))
                    session.add(StaffWorkingHours(
                        user_id=master.id, studio_id=studio.id, day_of_week=day,
                        is_open=works, open_time=open_time, close_time=close_time,
                    ))

            # ── Лояльность и пакеты ───────────────────────────────────────────
            loyalty = StudioLoyaltyConfig(
                studio_id=studio.id, is_enabled=True, program_name="FIGARO Club",
                points_exchange_rate=20, expiry_period="12_months",
            )
            levels = [
                LoyaltyLevel(studio_id=studio.id, name="Новичок", color="#C9B29B", min_threshold=0, max_threshold=2_999, sort_order=0, point_value=1),
                LoyaltyLevel(studio_id=studio.id, name="Свой", color="#B87333", min_threshold=3_000, max_threshold=7_999, sort_order=1, point_value=1),
                LoyaltyLevel(studio_id=studio.id, name="Клуб", color="#8C6A4A", min_threshold=8_000, max_threshold=17_999, sort_order=2, point_value=2),
                LoyaltyLevel(studio_id=studio.id, name="Легенда", color="#4A3B32", min_threshold=18_000, max_threshold=None, sort_order=3, point_value=2),
            ]
            subscription_config = StudioSubscriptionProgramConfig(
                studio_id=studio.id, is_enabled=True, allow_freeze=True,
                allow_transfer=False, auto_renewal=False,
            )
            session.add_all([loyalty, subscription_config, *levels])
            await session.flush()

            package_rows: list[SubscriptionPackage] = []
            for sort_order, (name, class_count, price, duration_days, restricted, sold_single, sold_subscription) in enumerate(PACKAGES):
                package = SubscriptionPackage(
                    studio_id=studio.id,
                    config_id=subscription_config.id,
                    name=name,
                    class_count=class_count,
                    price=price,
                    per_visit_price=round(price / class_count),
                    is_active=True,
                    sort_order=sort_order,
                    duration_days=duration_days,
                    service_ids=None if restricted is None else [services[item].id for item in restricted],
                    sold_as_single=sold_single,
                    sold_as_subscription=sold_subscription,
                )
                session.add(package)
                package_rows.append(package)
            await session.flush()
            # Пакет с ограничением списывает только свои услуги; None — любую.
            package_services = {
                package.id: (set(package.service_ids) if package.service_ids else None)
                for package in package_rows
            }

            # ── Клиенты ───────────────────────────────────────────────────────
            clients: list[Client] = []
            for index, (name, last_name) in enumerate(CLIENTS, start=1):
                digits = 601_000_000 + index * 10_007
                # Новичок обязан быть моложе истории визитов, старожил — старше:
                # иначе в журнале найдётся запись за месяц до регистрации.
                registered_days_ago = RNG.randint(3, 25) if index > 47 else RNG.randint(history_days + 10, 620)
                registration = datetime.combine(today - timedelta(days=registered_days_ago), time.min)
                clients.append(Client(
                    studio_id=studio.id,
                    name=name,
                    last_name=last_name,
                    phone=f"+420 {digits // 1_000_000} {digits // 1_000 % 1_000:03d} {digits % 1_000:03d}",
                    phone_verified=index % 4 != 0,
                    email=f"figaro.client{index}@example.invalid",
                    city="Prague",
                    avatar_color=RNG.choice(["#B87333", "#8C6A4A", "#A9744F", "#6E5849", "#C9B29B"]),
                    status="active" if index <= 40 else "at_risk" if index <= 47 else "new",
                    tags=(
                        ["VIP", "борода"] if index in {2, 9, 17, 28} else
                        ["at_risk"] if 41 <= index <= 47 else
                        ["new"] if index > 47 else ["regular"]
                    ),
                    registration_date=registration,
                    notifs_enabled=True,
                    reminders_enabled=True,
                    is_active=True,
                    source=RNG.choice(["instagram", "referral", "walk_in", "google", "telegram"]),
                    invite_code=f"FIG{index:03d}",
                ))
            session.add_all(clients)
            await session.flush()

            # ── Деньги: счета и способы оплаты ────────────────────────────────
            terminal = Account(studio_id=studio.id, name="Терминал · CZK", type="bank", balance=0, daily_change=0, color="#635BFF", is_system=True)
            cash_desk = Account(studio_id=studio.id, name="Касса на ресепшене", type="cash", balance=0, daily_change=0, color="#B87333", is_system=True)
            session.add_all([terminal, cash_desk])
            session.add_all([
                PaymentMethodConfig(studio_id=studio.id, method_type="stripe", method_name="Карта / Stripe", is_enabled=True, commission_rate=1.5, monthly_transactions=0),
                PaymentMethodConfig(studio_id=studio.id, method_type="cash", method_name="Наличные в клубе", is_enabled=True, commission_rate=0, monthly_transactions=0),
            ])
            await session.flush()

            # ── Пакеты у клиентов ─────────────────────────────────────────────
            subscriptions: dict[int, list[ClientSubscription]] = defaultdict(list)
            spent_by_client: defaultdict[int, int] = defaultdict(int)
            for index, client in enumerate(clients):
                if index % 3 or index >= 45:  # примерно каждый третий активный клиент
                    continue
                # Последний пакет — подарочный сертификат, он не продаётся абонементом.
                package = package_rows[(index // 3) % (len(package_rows) - 1)]
                started = today - timedelta(days=RNG.randint(3, 55))
                subscription = ClientSubscription(
                    client_id=client.id,
                    type=package.name,
                    total_classes=package.class_count,
                    used_classes=0,
                    starts_at=started,
                    expires_at=started + timedelta(days=package.duration_days),
                    duration_days=package.duration_days,
                    status="active",
                    is_frozen=False,
                    package_id=package.id,
                    created_at=datetime.combine(started, time.min),
                )
                session.add(subscription)
                subscriptions[client.id].append(subscription)
                spent_by_client[client.id] += package.price
                account = terminal if index % 2 else cash_desk
                session.add(ClientPayment(
                    client_id=client.id,
                    amount=package.price,
                    description=f"{package.name} · FIGARO",
                    status="success",
                    created_at=datetime.combine(started, time.min),
                    action_type="subscription",
                    item_key=str(package.id),
                ))
                session.add(Operation(
                    studio_id=studio.id,
                    client_id=client.id,
                    account_id=account.id,
                    type="in",
                    title=f"Пакет · {package.name}",
                    amount=package.price,
                    op_date=started,
                    category="Абонементы",
                    method="online_card" if account is terminal else "cash",
                    status="completed",
                ))
            await session.flush()

            # ── Записи ────────────────────────────────────────────────────────
            # Одна запись = один интервал мастера (resource): вместимость 1,
            # свой Lesson и ровно одна бронь. Курсор идёт по рабочему окну
            # мастера подряд, поэтому пересечений по мастеру и креслу нет.
            service_names = [row[0] for row in SERVICES]
            # Постоянные клиенты попадаются чаще случайных — так выглядит живая база.
            client_weights = [max(1, 30 - index // 2) for index in range(len(clients))]
            appointments: list[tuple[Lesson, Client, str, int]] = []
            busy_rows = 0

            for offset in range(-history_days, FUTURE_DAYS + 1):
                day = today + timedelta(days=offset)
                weekday = day.weekday()
                if weekday not in MASTER_HOURS:
                    continue
                is_past = day < today
                # Чем дальше в будущее, тем свободнее календарь — как в жизни.
                occupancy = 0.82 if is_past else max(0.2, 0.62 - 0.03 * offset)
                for index, (_n, _l, _d, master_services, _p, branch_name, chair_name) in enumerate(MASTERS):
                    if days_off[index] == weekday:
                        continue
                    master = masters[index]
                    open_time, close_time = MASTER_HOURS[weekday]
                    cursor, closes = _minutes(open_time), _minutes(close_time)
                    # Перерыв на обед: у чётных мастеров раньше, у нечётных позже,
                    # чтобы клуб не пустел целиком.
                    lunch_from = (13 * 60) if index % 2 == 0 else (14 * 60)
                    lunch_to = lunch_from + 45
                    session.add(StaffBusyInterval(
                        studio_id=studio.id, user_id=master.id,
                        start_time=_at(day, lunch_from), end_time=_at(day, lunch_to),
                        tz_iana=TZ, reason="Обед",
                    ))
                    busy_rows += 1
                    while cursor < closes:
                        name = RNG.choices(
                            list(master_services),
                            weights=[weights[item] for item in master_services],
                        )[0]
                        service = services[name]
                        finish = cursor + service.duration_min
                        if finish > closes:
                            break
                        if lunch_from < finish and cursor < lunch_to:
                            cursor = lunch_to
                            continue
                        if RNG.random() > occupancy:
                            cursor += 15
                            continue
                        client = RNG.choices(clients, weights=client_weights)[0]
                        if client.registration_date.date() > day:
                            cursor += 15  # клиента тогда ещё не было — окно осталось пустым
                            continue
                        status = "active" if not is_past else "attended" if RNG.random() > 0.07 else "cancelled"
                        lesson = Lesson(
                            studio_id=studio.id,
                            service_id=service.id,
                            teacher_id=master.id,
                            teacher_name=f"{master.name} {master.last_name}",
                            branch_id=branches[branch_name].id,
                            hall_id=chairs[chair_name].id if chair_name else None,
                            name=service.name,
                            start_time=_at(day, cursor),
                            tz_iana=TZ,
                            duration_min=service.duration_min,
                            price=service.price,
                            buffer_before_min=0,
                            buffer_after_min=service.buffer_after_min,
                            total_spots=1,
                            booking_mode="resource",
                            status="confirmed",
                            level="",
                            equipment="",
                            version=1,
                        )
                        session.add(lesson)
                        appointments.append((lesson, client, status, service.id))
                        cursor = finish + service.buffer_after_min
            await session.flush()

            # ── Брони, деньги за визиты, статистика ───────────────────────────
            income_by_account: defaultdict[int, int] = defaultdict(int)
            service_stats: defaultdict[int, list[int]] = defaultdict(lambda: [0, 0])
            last_seen: dict[int, date] = {}
            reservation_count = 0

            for lesson, client, status, service_id in appointments:
                day = lesson.start_time.date()
                covered = None
                for item in subscriptions[client.id]:
                    # Визит вне срока пакета оплачивается деньгами: списать его
                    # задним числом с ещё не купленного абонемента нельзя.
                    if item.used_classes >= item.total_classes or not item.starts_at <= day <= item.expires_at:
                        continue
                    allowed = package_services.get(item.package_id)
                    if allowed is None or service_id in allowed:
                        covered = item
                        break
                charge_to_subscription = covered is not None and status != "cancelled"
                session.add(Reservation(
                    client_id=client.id,
                    lesson_id=lesson.id,
                    spot_number=1,
                    status=status,
                    rating=RNG.choice([4, 5, 5]) if status == "attended" and RNG.random() < 0.3 else None,
                    created_at=datetime.combine(day - timedelta(days=RNG.randint(1, 9)), time.min),
                    booking_channel=RNG.choice(["miniapp", "telegram", "admin", "widget"]),
                    subscription_id=covered.id if charge_to_subscription else None,
                    cancelled_at=datetime.combine(day, time.min) if status == "cancelled" else None,
                ))
                reservation_count += 1
                if charge_to_subscription:
                    covered.used_classes += 1
                if status != "attended":
                    continue

                last_seen[client.id] = max(last_seen.get(client.id, day), day)
                service_stats[service_id][0] += 1
                service_stats[service_id][1] += lesson.price
                if charge_to_subscription:
                    continue
                account = cash_desk if RNG.random() < 0.42 else terminal
                session.add(Operation(
                    studio_id=studio.id,
                    client_id=client.id,
                    account_id=account.id,
                    trainer_id=lesson.teacher_id,
                    type="in",
                    title=f"{lesson.name} · {lesson.teacher_name}",
                    amount=lesson.price,
                    op_date=day,
                    category="Услуги",
                    method="cash" if account is cash_desk else "online_card",
                    status="completed",
                ))
                income_by_account[account.id] += lesson.price
                spent_by_client[client.id] += lesson.price

            # Пакет, из которого выбраны все визиты, закрыт — тем же словом,
            # что ставит домен списания (services/subscription_charge.py).
            for rows in subscriptions.values():
                for item in rows:
                    if item.used_classes >= item.total_classes:
                        item.status = "finished"

            for client in clients:
                if client.id in last_seen:
                    client.last_visit_date = last_seen[client.id]
                elif client.status == "at_risk":
                    client.last_visit_date = today - timedelta(days=RNG.randint(40, 90))
                else:
                    client.last_visit_date = None
            for client in clients:
                level = next(
                    item for item in reversed(levels)
                    if spent_by_client[client.id] >= item.min_threshold
                )
                session.add(ClientLoyaltyCard(
                    studio_id=studio.id,
                    client_id=client.id,
                    level_id=level.id,
                    points_balance=RNG.randint(10, 480),
                    total_spent=spent_by_client[client.id],
                    deposit_balance=0,
                ))
            for service in services.values():
                service.bookings_count = service_stats[service.id][0]
                service.revenue_total = service_stats[service.id][1]

            # ── Расходы, зарплаты, документы, цели ────────────────────────────
            counterparty_specs = (
                ("Dlouhá Estates s.r.o.", "Аренда", "#8E7CC3"),
                ("Barber Supply CZ", "Материалы", "#C27BA0"),
                ("Meta Ads Czech Republic", "Маркетинг", "#4A86E8"),
                ("Pražská energetika", "Коммунальные", "#F6B26B"),
                ("Clean & Sharp", "Клининг", "#93C47D"),
                ("Bookkeep Prague", "Бухгалтерия", "#76A5AF"),
            )
            counterparties: dict[str, Counterparty] = {}
            for name, category, color in counterparty_specs:
                row = Counterparty(
                    studio_id=studio.id, name=name, counterparty_type="company",
                    category=category, balance=0, deals_count=0, color=color,
                )
                session.add(row)
                counterparties[name] = row
            await session.flush()

            expense_count = 0
            for months_back in range(HISTORY_MONTHS - 1, -1, -1):
                start = _month_start(today, months_back)
                end = today if months_back == 0 else _month_start(today, months_back - 1) - timedelta(days=1)
                fixed_costs = (
                    ("Dlouhá Estates s.r.o.", "Аренда", 62_000, "Аренда · Staré Město", 4),
                    ("Dlouhá Estates s.r.o.", "Аренда", 48_000, "Аренда · Karlín", 4),
                    ("Barber Supply CZ", "Материалы", 18_400, "Косметика, лезвия, полотенца", 8),
                    ("Meta Ads Czech Republic", "Маркетинг", 14_000, "Реклама Meta и Instagram", 9),
                    ("Pražská energetika", "Коммунальные", 9_500, "Электричество и вода", 11),
                    ("Clean & Sharp", "Клининг", 6_400, "Уборка и заточка инструмента", 12),
                    ("Bookkeep Prague", "Бухгалтерия", 4_500, "Бухгалтерское сопровождение", 14),
                )
                for counterparty_name, category, amount, title, day_offset in fixed_costs:
                    session.add(Operation(
                        studio_id=studio.id,
                        account_id=terminal.id,
                        counterparty_id=counterparties[counterparty_name].id,
                        type="out",
                        title=f"{title} · {start:%m/%Y}",
                        amount=amount,
                        op_date=min(start + timedelta(days=day_offset), today),
                        category=category,
                        method="bank_transfer",
                        status="completed",
                    ))
                    counterparties[counterparty_name].deals_count += 1
                    expense_count += 1

                # Выплата мастеру считается из выручки его записей за период —
                # тем же правилом, что и страница «Зарплаты» (percent).
                for index, master in enumerate(masters):
                    visits, revenue = 0, 0
                    for lesson, _client, status, _service_id in appointments:
                        if lesson.teacher_id != master.id or status != "attended":
                            continue
                        if start <= lesson.start_time.date() <= end:
                            visits += 1
                            revenue += lesson.price
                    if not visits:
                        continue
                    amount = round(revenue * 0.45)
                    session.add(SalaryPayment(
                        studio_id=studio.id,
                        user_id=master.id,
                        period_start=start,
                        period_end=end,
                        sessions_count=visits,
                        hours_worked=round(visits * 0.75, 1),
                        rate_snapshot=45,
                        rate_type_snapshot="percent",
                        amount=amount,
                        status="paid",
                        paid_at=datetime.combine(end, time.min).replace(hour=18),
                        note="FIGARO demo · выплата мастеру за месяц",
                    ))
                    session.add(Operation(
                        studio_id=studio.id,
                        account_id=terminal.id,
                        trainer_id=master.id,
                        type="out",
                        title=f"Выплата мастеру · {master.name} {master.last_name} · {start:%m/%Y}",
                        amount=amount,
                        op_date=end,
                        category="Оплата мастерам",
                        method="bank_transfer",
                        status="completed",
                    ))
                    expense_count += 1

            session.add_all([
                FinDocument(
                    studio_id=studio.id,
                    counterparty_id=counterparties["Dlouhá Estates s.r.o."].id,
                    title="Договор аренды · Dlouhá 12",
                    doc_type="contract",
                    upload_date=datetime.combine(today - timedelta(days=12), time.min),
                    amount=62_000, status="signed", file_ext="pdf", requires_signature=True,
                ),
                FinDocument(
                    studio_id=studio.id,
                    counterparty_id=counterparties["Barber Supply CZ"].id,
                    title="Счёт на косметику и расходники",
                    doc_type="invoice",
                    upload_date=datetime.combine(today - timedelta(days=6), time.min),
                    amount=18_400, status="paid", file_ext="pdf", requires_signature=False,
                ),
                FinDocument(
                    studio_id=studio.id,
                    counterparty_id=counterparties["Meta Ads Czech Republic"].id,
                    title="Счёт Meta Ads · текущий месяц",
                    doc_type="invoice",
                    upload_date=datetime.combine(today - timedelta(days=4), time.min),
                    amount=14_000, status="paid", file_ext="pdf", requires_signature=False,
                ),
                FinancialGoal(
                    studio_id=studio.id,
                    title="Выручка клуба за месяц",
                    target_amount=520_000,
                    current_amount=sum(income_by_account.values()) // 2,
                    deadline=_month_end(today),
                    category="Услуги",
                    color="#B87333",
                    priority="high",
                    tracking_mode="manual",
                    op_type="in",
                ),
                FinancialGoal(
                    studio_id=studio.id,
                    title="Ремонт кресел в Karlíne",
                    target_amount=140_000,
                    current_amount=52_000,
                    deadline=today + timedelta(days=120),
                    category="Оборудование",
                    color="#8C6A4A",
                    priority="medium",
                    tracking_mode="manual",
                    op_type="out",
                ),
            ])

            for account in (terminal, cash_desk):
                account.balance = income_by_account[account.id]
                account.daily_change = RNG.randint(2_000, 12_000)

            await session.flush()
            return {
                "studio_id": studio.id,
                "branches": len(branches),
                "chairs": len(chairs),
                "services": len(services),
                "masters": len(masters),
                "clients": len(clients),
                "packages": len(package_rows),
                "appointments": len(appointments),
                "reservations": reservation_count,
                "breaks": busy_rows,
                "expenses": expense_count,
            }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed the FIGARO barbershop demo studio (resource booking).")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write the demo data; without this flag the script only explains how to run it",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    if not args.apply:
        print("No data written. Re-run with: python back/scripts/seed_barber_demo_studio.py --apply")
        return
    summary = await seed()
    print("FIGARO barbershop demo created successfully:")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    print(f"Owner login: figaro.demo.owner@example.invalid / {PASSWORD}")
    print(f"Verify with: cd back && python -m scripts.hybrid_booking_audit --studio-id {summary['studio_id']}")


if __name__ == "__main__":
    asyncio.run(main())
