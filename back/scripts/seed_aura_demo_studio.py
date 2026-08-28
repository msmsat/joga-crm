"""Create one complete, realistic multi-branch wellness studio for demos.

The script is deliberately additive: it creates a new studio and never changes
or deletes existing data. It also refuses to run a second time while the AURA
demo is already present. Run from the repository root:

    python back/scripts/seed_aura_demo_studio.py --apply

All amounts are in CZK, matching the seeded studio currency.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

# Allow the documented `python back/scripts/...py` invocation from the project
# root. Python otherwise adds only back/scripts to sys.path. The application
# itself uses `models`, `services`, and `database` as top-level back modules.
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
    Hall,
    Lesson,
    LoyaltyLevel,
    Operation,
    PaymentMethodConfig,
    Reservation,
    Service,
    StaffWorkingHours,
    Studio,
    StudioAISettings,
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


STUDIO_NAME = "AURA Movement Studio · Demo"
STUDIO_EMAIL = "hello@auramovement-demo.cz"
PASSWORD = "DemoOnly-ChangeMe-2026"
RNG = random.Random(20260828)

# Real editorial photographs from Unsplash. Keep the source record in
# docs/DEMO_AURA_PHOTO_SOURCES.md when moving the demo to another environment.
PHOTOS = {
    "cover": "https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=1600&q=85",
    "reformer": "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1400&q=85",
    "flow": "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1400&q=85",
    "barre": "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1400&q=85",
    "strength": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1400&q=85",
    "calm": "https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1400&q=85",
    "coach_1": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=720&q=85",
    "coach_2": "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=720&q=85",
    "coach_3": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=720&q=85",
    "coach_4": "https://images.unsplash.com/photo-1594381898411-846e7d193883?auto=format&fit=crop&w=720&q=85",
}

BRANCHES = (
    ("Vinohrady", "Vinohradská 42, Praha 2", "Prague", PHOTOS["reformer"]),
    ("Karlín", "Křižíkova 68, Praha 8", "Prague", PHOTOS["flow"]),
    ("Smíchov", "Nádražní 58, Praha 5", "Prague", PHOTOS["barre"]),
)

HALLS = (
    ("Vinohrady", "Reformer Room", 10, 105, ["10 reformers", "mirrors", "lockers"], "#DFA67B", PHOTOS["reformer"]),
    ("Vinohrady", "Flow Studio", 18, 92, ["mats", "bolsters", "blocks"], "#9DBEAC", PHOTOS["flow"]),
    ("Karlín", "The Loft", 16, 120, ["mats", "TRX", "sound system"], "#A8B4D5", PHOTOS["strength"]),
    ("Karlín", "Still Room", 12, 72, ["mats", "blankets", "eye pillows"], "#C9A7C7", PHOTOS["calm"]),
    ("Smíchov", "Barre Hall", 14, 98, ["barres", "light weights", "mirrors"], "#E7B6B3", PHOTOS["barre"]),
    ("Smíchov", "Private Suite", 2, 35, ["reformer", "chair", "tower"], "#D1B589", PHOTOS["reformer"]),
)

SERVICES = (
    ("Reformer Pilates", "Малые группы на реформерах: сила, осанка и точный контроль движения.", 390, 55, "Pilates", "group", "#DFA67B", 10),
    ("Pilates Mat", "Осознанная работа с центром тела, гибкостью и стабильностью.", 290, 55, "Pilates", "group", "#E3B88A", 16),
    ("Power Pilates", "Динамичный формат Pilates для силы и выносливости.", 320, 55, "Pilates", "group", "#C78B76", 14),
    ("Vinyasa Flow", "Плавная виньяса для энергии, мобильности и концентрации.", 310, 60, "Yoga", "group", "#9DBEAC", 18),
    ("Hatha Yoga", "Спокойная практика с вниманием к технике и дыханию.", 290, 60, "Yoga", "group", "#7FA69A", 16),
    ("Yin & Restore", "Глубокое расслабление, мягкая растяжка и восстановление.", 310, 75, "Yoga", "group", "#C9A7C7", 12),
    ("Mobility & Stretch", "Подвижность суставов и здоровая амплитуда движения.", 280, 55, "Mobility", "group", "#A8B4D5", 16),
    ("Barre Sculpt", "Балетная техника, мышечный тонус и красивая осанка.", 330, 55, "Barre", "group", "#E7B6B3", 14),
    ("Strength & Conditioning", "Функциональная сила без перегруза и скучной рутины.", 320, 55, "Strength", "group", "#D07B67", 16),
    ("Dance Cardio", "Музыка, кардио и хорошее настроение в одном занятии.", 300, 55, "Dance", "group", "#F2B84B", 16),
    ("Breathwork & Meditation", "Дыхательные техники для снижения стресса и ясности.", 260, 45, "Mindfulness", "group", "#8BA8C8", 12),
    ("Private Training", "Индивидуальная тренировка по вашей цели и состоянию тела.", 990, 55, "Personal", "individual", "#B18F6A", 1),
)

TRAINERS = (
    ("Anna", "Kovářová", "Pilates Lead", "Reformer Pilates, Pilates Mat", PHOTOS["coach_1"]),
    ("Lucie", "Novotná", "Yoga Instructor", "Vinyasa Flow, Hatha Yoga", PHOTOS["coach_2"]),
    ("Karolína", "Dvořáková", "Mindful Movement Coach", "Yin & Restore, Breathwork & Meditation", PHOTOS["coach_3"]),
    ("Tereza", "Veselá", "Barre & Dance Coach", "Barre Sculpt, Dance Cardio", PHOTOS["coach_4"]),
    ("Eva", "Králová", "Strength Coach", "Strength & Conditioning, Mobility & Stretch", PHOTOS["coach_1"]),
    ("Michaela", "Benešová", "Pilates Instructor", "Power Pilates, Reformer Pilates", PHOTOS["coach_2"]),
    ("Sofia", "Malá", "Yoga Instructor", "Hatha Yoga, Yin & Restore", PHOTOS["coach_3"]),
    ("Nina", "Procházková", "Movement Coach", "Mobility & Stretch, Pilates Mat", PHOTOS["coach_4"]),
    ("Klára", "Jelínková", "Personal Trainer", "Private Training, Strength & Conditioning", PHOTOS["coach_1"]),
    ("Petra", "Horáková", "Dance Coach", "Dance Cardio, Barre Sculpt", PHOTOS["coach_2"]),
    ("Markéta", "Černá", "Pilates Instructor", "Reformer Pilates, Power Pilates", PHOTOS["coach_3"]),
    ("David", "Svoboda", "Breathwork Coach", "Breathwork & Meditation, Mobility & Stretch", PHOTOS["coach_4"]),
    ("Veronika", "Marková", "Studio Manager", "Client experience & operations", PHOTOS["coach_1"]),
    ("Jakub", "Novák", "Founder", "Studio strategy & community", PHOTOS["coach_2"]),
)

CLIENTS = (
    ("Eliška", "Nováková"), ("Barbora", "Černá"), ("Adéla", "Dvořáková"), ("Kristýna", "Horáková"),
    ("Tereza", "Procházková"), ("Kateřina", "Veselá"), ("Nela", "Benešová"), ("Veronika", "Malá"),
    ("Lucie", "Králová"), ("Monika", "Jelínková"), ("Petra", "Kučerová"), ("Anna", "Fialová"),
    ("Karolína", "Šimková"), ("Daniela", "Pokorná"), ("Michaela", "Pospíšilová"), ("Jana", "Blažková"),
    ("Nikola", "Valentová"), ("Alena", "Růžičková"), ("Ivana", "Křížová"), ("Sabina", "Bartošová"),
    ("Lenka", "Šťastná"), ("Dominika", "Holubová"), ("Martina", "Vlachová"), ("Zuzana", "Tichá"),
    ("Filip", "Kříž"), ("Tomáš", "Doležal"), ("Jan", "Mareš"), ("Pavel", "Bartoš"),
    ("Martin", "Říha"), ("Ondřej", "Janda"), ("Adam", "Šimek"), ("Jakub", "Pavlík"),
    ("Viktorie", "Pešková"), ("Ema", "Vlčková"), ("Laura", "Konečná"), ("Natálie", "Zemanová"),
    ("Gabriela", "Kohoutová"), ("Simona", "Kubíčková"), ("Andrea", "Beránková"), ("Hana", "Vítková"),
    ("Matěj", "Čech"), ("Richard", "Urban"), ("Lukáš", "Vaněk"), ("Roman", "Skála"),
    ("Šárka", "Krejčí"), ("Irena", "Ševčíková"), ("Renata", "Musilová"), ("Olga", "Havlíková"),
)


def _working_hours(studio_id: int) -> list[StudioWorkingHours]:
    return [
        StudioWorkingHours(
            studio_id=studio_id,
            day_of_week=day,
            is_open=True,
            open_time="08:00" if day < 5 else "09:00",
            close_time="21:30" if day < 5 else "18:00",
        )
        for day in range(7)
    ]


def _branch_hours(branch_id: int) -> list[BranchWorkingHours]:
    return [
        BranchWorkingHours(
            branch_id=branch_id,
            day_of_week=day,
            is_open=True,
            open_time="08:00" if day < 5 else "09:00",
            close_time="21:30" if day < 5 else "18:00",
        )
        for day in range(7)
    ]


async def seed() -> dict[str, int]:
    async with async_session_maker() as session:
        async with session.begin():
            exists = await session.scalar(select(Studio.id).where(Studio.email == STUDIO_EMAIL))
            if exists:
                raise RuntimeError(
                    "AURA demo already exists. It was not modified; delete it manually only if you want a fresh demo."
                )

            studio = Studio(
                name=STUDIO_NAME,
                phone="+420 212 345 678",
                business_type="wellness",
                business_subtype="pilates_yoga_fitness",
                description=(
                    "Сеть светлых городских студий для Pilates, yoga и осознанного движения. "
                    "Небольшие группы, сильные тренеры и сервис без лишних шагов."
                ),
                email=STUDIO_EMAIL,
                website="https://auramovement-demo.cz",
                address="Vinohradská 42, Praha 2",
                country="CZ",
                postal_code="120 00",
                city="Prague",
                logo_url=PHOTOS["cover"],
                timezone="UTC+2",
                tz_iana="Europe/Prague",
                language="cs",
                currency="CZK",
                date_format="DD.MM.YYYY",
                first_day_of_week="monday",
                journal_time_step=15,
            )
            session.add(studio)
            await session.flush()

            session.add_all(_working_hours(studio.id))
            session.add(
                StudioBookingSettings(
                    studio_id=studio.id,
                    booking_active=True,
                    prefill_on_booking=True,
                    booking_window_days=21,
                    cancellation_deadline_min=180,
                    widget_accent_color="#DFA67B",
                    widget_logo_url=PHOTOS["cover"],
                    widget_language="cs",
                    miniapp_generated=True,
                    trial_lesson_free=True,
                    coffee_enabled=True,
                    coffee_spots=[
                        {"name": "Můj šálek kávy", "address": "Křižíkova 105, Praha 8", "url": "https://www.google.com/maps"},
                        {"name": "Café Louvre", "address": "Národní 22, Praha 1", "url": "https://www.google.com/maps"},
                    ],
                )
            )
            session.add(
                StudioAISettings(
                    studio_id=studio.id,
                    language="cs",
                    system_prompt=(
                        "Jsi AURA Assistant. Odpovídej stručně, mile a prakticky v češtině. "
                        "Pomáhej klientům vybrat lekci, rezervovat místo, vysvětlit balíčky a předat "
                        "složitý nebo citlivý požadavek živému týmu."
                    ),
                    tg_enabled=False,
                    ig_enabled=False,
                    wa_enabled=False,
                    tg_tone="friendly",
                    ig_tone="friendly",
                    wa_tone="friendly",
                )
            )

            branches: dict[str, StudioBranch] = {}
            for name, address, city, photo_url in BRANCHES:
                branch = StudioBranch(
                    studio_id=studio.id,
                    name=name,
                    phone="+420 212 345 678",
                    email=f"{name.lower()}@auramovement-demo.cz",
                    address=address,
                    country="CZ",
                    city=city,
                    photo_url=photo_url,
                )
                session.add(branch)
                branches[name] = branch
            await session.flush()
            for branch in branches.values():
                session.add_all(_branch_hours(branch.id))

            halls: dict[str, Hall] = {}
            for branch_name, name, capacity, area, equipment, color, photo_url in HALLS:
                hall = Hall(
                    studio_id=studio.id,
                    branch_id=branches[branch_name].id,
                    name=name,
                    capacity=capacity,
                    area=area,
                    equipment=equipment,
                    hourly_rate=0,
                    color=color,
                    photo_url=photo_url,
                )
                session.add(hall)
                halls[name] = hall

            services: dict[str, Service] = {}
            for name, description, price, duration, category, service_type, color, max_clients in SERVICES:
                service = Service(
                    studio_id=studio.id,
                    name=name,
                    description=description,
                    price=price,
                    duration_min=duration,
                    category=category,
                    service_type=service_type,
                    color=color,
                    max_clients=max_clients,
                )
                session.add(service)
                services[name] = service
            await session.flush()

            trainers: list[User] = []
            service_names_by_trainer: list[list[str]] = []
            for index, (name, last_name, department, specialties, photo_url) in enumerate(TRAINERS, start=1):
                user = User(
                    email=f"aura.demo.coach{index}@example.invalid",
                    hashed_password=get_password_hash(PASSWORD),
                    name=name,
                    last_name=last_name,
                    phone=f"+420 777 100 {index:03d}",
                    photo_url=photo_url,
                    avg_rating=round(RNG.uniform(4.7, 5.0), 1),
                    is_verified=True,
                    is_onboarded=True,
                    language="cs",
                    accent_color="#DFA67B",
                )
                session.add(user)
                trainers.append(user)
                service_names_by_trainer.append([item.strip() for item in specialties.split(",") if item.strip() in services])
            await session.flush()

            for index, user in enumerate(trainers):
                name, last_name, department, _specialties, photo_url = TRAINERS[index]
                role = "owner" if department == "Founder" else "manager" if department == "Studio Manager" else "trainer"
                session.add(
                    StudioMember(
                        user_id=user.id,
                        studio_id=studio.id,
                        role=role,
                        status="active",
                        name=name,
                        last_name=last_name,
                        photo_url=photo_url,
                        department=department,
                        salary=0,
                        rate=650 if role == "trainer" else 0,
                        rate_type="per_lesson" if role == "trainer" else "monthly",
                    )
                )
                # Do not assign user.services here: a relationship assignment on
                # an already-flushed object triggers lazy loading, which is not
                # legal inside SQLAlchemy's async session. Insert the junction
                # rows explicitly instead.
                trainer_service_rows = [
                    {"user_id": user.id, "service_id": services[service_name].id}
                    for service_name in service_names_by_trainer[index]
                ]
                if trainer_service_rows:
                    await session.execute(user_services.insert(), trainer_service_rows)
                if role == "trainer":
                    session.add_all(
                        StaffWorkingHours(
                            user_id=user.id,
                            studio_id=studio.id,
                            day_of_week=day,
                            is_open=day < 6,
                            open_time="08:00",
                            close_time="20:30",
                        )
                        for day in range(7)
                    )

            loyalty = StudioLoyaltyConfig(
                studio_id=studio.id,
                is_enabled=True,
                program_name="AURA Circle",
                points_exchange_rate=20,
                expiry_period="12_months",
            )
            levels = [
                LoyaltyLevel(studio_id=studio.id, name="Glow", color="#DFA67B", min_threshold=0, max_threshold=4999, sort_order=0, point_value=1),
                LoyaltyLevel(studio_id=studio.id, name="Flow", color="#9DBEAC", min_threshold=5000, max_threshold=11999, sort_order=1, point_value=1),
                LoyaltyLevel(studio_id=studio.id, name="Rise", color="#C9A7C7", min_threshold=12000, max_threshold=24999, sort_order=2, point_value=2),
                LoyaltyLevel(studio_id=studio.id, name="Aura", color="#B18F6A", min_threshold=25000, max_threshold=None, sort_order=3, point_value=2),
            ]
            subscription_config = StudioSubscriptionProgramConfig(
                studio_id=studio.id,
                is_enabled=True,
                allow_freeze=True,
                allow_transfer=True,
                auto_renewal=True,
            )
            session.add_all([loyalty, subscription_config, *levels])
            await session.flush()

            packages = [
                ("Intro · 3 visits", 3, 790, 30, ["Pilates Mat", "Hatha Yoga", "Mobility & Stretch"], True, True),
                ("Flow · 5 visits", 5, 1_390, 45, ["Vinyasa Flow", "Hatha Yoga", "Yin & Restore", "Mobility & Stretch"], False, True),
                ("Move · 8 visits", 8, 2_090, 60, None, False, True),
                ("Reformer · 8 visits", 8, 2_690, 60, ["Reformer Pilates", "Power Pilates"], False, True),
                ("Unlimited Day", 1, 390, 1, None, True, False),
                ("Private · 5 sessions", 5, 4_490, 90, ["Private Training"], False, True),
                ("Morning Ritual · 10 visits", 10, 2_390, 60, ["Hatha Yoga", "Mobility & Stretch", "Breathwork & Meditation"], False, True),
                ("AURA Monthly", 16, 3_490, 31, None, False, True),
            ]
            package_rows: list[SubscriptionPackage] = []
            for sort_order, (name, class_count, price, duration_days, restricted_services, sold_single, sold_subscription) in enumerate(packages):
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
                    service_ids=None if restricted_services is None else [services[name].id for name in restricted_services],
                    sold_as_single=sold_single,
                    sold_as_subscription=sold_subscription,
                )
                session.add(package)
                package_rows.append(package)
            await session.flush()

            clients: list[Client] = []
            subscriptions: dict[int, ClientSubscription] = {}
            today = date.today()
            for index, (name, last_name) in enumerate(CLIENTS, start=1):
                registration = datetime.combine(today - timedelta(days=RNG.randint(14, 360)), datetime.min.time())
                client = Client(
                    studio_id=studio.id,
                    name=name,
                    last_name=last_name,
                    phone=f"+420 608 {index:03d} {RNG.randint(100, 999)}",
                    phone_verified=index % 3 != 0,
                    email=f"aura.client{index}@example.invalid",
                    city="Prague",
                    avatar_color=RNG.choice(["#DFA67B", "#9DBEAC", "#C9A7C7", "#A8B4D5", "#E7B6B3"]),
                    status="active" if index <= 36 else "at_risk" if index <= 43 else "new",
                    tags=(
                        ["VIP", "reformer"] if index in {1, 7, 14, 23} else
                        ["at_risk"] if 37 <= index <= 43 else
                        ["new"] if index > 43 else ["regular"]
                    ),
                    registration_date=registration,
                    notifs_enabled=True,
                    reminders_enabled=True,
                    is_active=True,
                    source=RNG.choice(["instagram", "referral", "telegram", "walk_in", "google"]),
                    invite_code=f"AURA{index:03d}",
                )
                session.add(client)
                clients.append(client)
            await session.flush()

            accounts = [
                Account(studio_id=studio.id, name="Stripe · CZK", type="bank", balance=0, daily_change=0, color="#635BFF", is_system=True),
                Account(studio_id=studio.id, name="Reception cash", type="cash", balance=0, daily_change=0, color="#DFA67B", is_system=True),
            ]
            session.add_all(accounts)
            session.add_all(
                [
                    PaymentMethodConfig(studio_id=studio.id, method_type="stripe", method_name="Online card / Stripe", is_enabled=True, commission_rate=1.5, monthly_transactions=0),
                    PaymentMethodConfig(studio_id=studio.id, method_type="cash", method_name="Cash at studio", is_enabled=True, commission_rate=0, monthly_transactions=0),
                ]
            )
            await session.flush()

            income_by_account: defaultdict[int, int] = defaultdict(int)
            for index, client in enumerate(clients):
                spent = 0
                if index < 39:
                    package = package_rows[(index + 2) % len(package_rows)]
                    started = today - timedelta(days=RNG.randint(2, 65))
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
                        created_at=datetime.combine(started, datetime.min.time()),
                    )
                    session.add(subscription)
                    subscriptions[client.id] = subscription
                    spent = package.price
                    account = accounts[index % 2]
                    session.add(
                        ClientPayment(
                            client_id=client.id,
                            amount=package.price,
                            description=f"{package.name} · AURA Movement",
                            status="success",
                            created_at=datetime.combine(started, datetime.min.time()),
                            action_type="subscription",
                            item_key=str(package.id),
                        )
                    )
                    session.add(
                        Operation(
                            studio_id=studio.id,
                            client_id=client.id,
                            account_id=account.id,
                            # Finance reports accept only the canonical values
                            # `in` and `out`; `income` is a display word, not a
                            # valid accounting direction.
                            type="in",
                            title=f"Абонемент · {package.name}",
                            amount=package.price,
                            op_date=started,
                            category="Абонементы",
                            method="online_card" if account.type == "bank" else "cash",
                            status="completed",
                        )
                    )
                    income_by_account[account.id] += package.price
                level = levels[min(3, index // 12)]
                session.add(
                    ClientLoyaltyCard(
                        studio_id=studio.id,
                        client_id=client.id,
                        level_id=level.id,
                        points_balance=RNG.randint(20, 650),
                        total_spent=spent + RNG.randint(0, 7_000),
                        deposit_balance=0,
                    )
                )

            # A balanced schedule: completed past classes drive reports; future
            # classes make the mini-app and booking views feel alive.
            await session.flush()
            eligible_trainer_indexes = [i for i, items in enumerate(service_names_by_trainer) if items]
            past_start = today - timedelta(days=42)
            lesson_count = 0
            reservation_count = 0
            service_stats: defaultdict[int, list[int]] = defaultdict(lambda: [0, 0])
            last_seen: dict[int, date] = {}
            for offset in range(64):
                lesson_day = past_start + timedelta(days=offset)
                if lesson_day.weekday() == 6 and offset % 2:
                    continue
                daily_slots = (8, 10, 17, 19) if lesson_day.weekday() < 5 else (9, 11, 16)
                for slot_index, hour in enumerate(daily_slots):
                    service = list(services.values())[(offset * 3 + slot_index * 5) % len(services)]
                    compatible = [i for i in eligible_trainer_indexes if service.name in service_names_by_trainer[i]]
                    if not compatible:
                        compatible = eligible_trainer_indexes
                    trainer = trainers[compatible[(offset + slot_index) % len(compatible)]]
                    if service.name == "Reformer Pilates":
                        hall = halls["Reformer Room"]
                    elif service.name == "Private Training":
                        hall = halls["Private Suite"]
                    elif service.name in {"Barre Sculpt", "Dance Cardio"}:
                        hall = halls["Barre Hall"]
                    elif service.name in {"Vinyasa Flow", "Hatha Yoga"}:
                        hall = halls["Flow Studio"]
                    elif service.name in {"Yin & Restore", "Breathwork & Meditation"}:
                        hall = halls["Still Room"]
                    else:
                        hall = halls["The Loft"]
                    lesson = Lesson(
                        studio_id=studio.id,
                        name=service.name,
                        teacher_name=f"{trainer.name} {trainer.last_name}",
                        teacher_id=trainer.id,
                        hall_id=hall.id,
                        start_time=datetime.combine(lesson_day, datetime.min.time()).replace(hour=hour),
                        tz_iana="Europe/Prague",
                        duration_min=service.duration_min,
                        price=service.price,
                        level=RNG.choice(["Beginner", "Open level", "Intermediate"]),
                        equipment="Included",
                        total_spots=service.max_clients or hall.capacity,
                        service_id=service.id,
                        status="confirmed",
                    )
                    session.add(lesson)
                    await session.flush()
                    lesson_count += 1
                    is_past = lesson_day < today
                    booked = 1 if service.name == "Private Training" else RNG.randint(max(3, (service.max_clients or 8) // 3), max(4, (service.max_clients or 8) - 1))
                    picks = RNG.sample(clients, k=min(booked, len(clients)))
                    for spot, client in enumerate(picks, start=1):
                        subscription = subscriptions.get(client.id)
                        can_charge = subscription is not None and subscription.used_classes < subscription.total_classes
                        status = "attended" if is_past and RNG.random() > 0.08 else "active"
                        reservation = Reservation(
                            client_id=client.id,
                            lesson_id=lesson.id,
                            spot_number=spot,
                            status=status,
                            rating=RNG.choice([4, 5]) if status == "attended" and RNG.random() < 0.28 else None,
                            review_text=None,
                            created_at=datetime.combine(lesson_day - timedelta(days=RNG.randint(1, 14)), datetime.min.time()),
                            booking_channel=RNG.choice(["miniapp", "telegram", "admin", "widget"]),
                            subscription_id=subscription.id if can_charge else None,
                            coffee=status == "active" and is_past is False and RNG.random() < 0.22,
                            is_trial=client.status == "new" and RNG.random() < 0.18,
                        )
                        session.add(reservation)
                        reservation_count += 1
                        if can_charge and status != "cancelled":
                            subscription.used_classes += 1
                        if is_past and status == "attended":
                            last_seen[client.id] = max(last_seen.get(client.id, lesson_day), lesson_day)
                            service_stats[service.id][0] += 1
                            service_stats[service.id][1] += service.price

            for client in clients:
                if client.id in last_seen:
                    client.last_visit_date = last_seen[client.id]
                elif client.status == "at_risk":
                    client.last_visit_date = today - timedelta(days=RNG.randint(22, 48))
                else:
                    client.last_visit_date = today - timedelta(days=RNG.randint(1, 14))
            for service in services.values():
                service.bookings_count = service_stats[service.id][0]
                service.revenue_total = service_stats[service.id][1]
            for account in accounts:
                account.balance = income_by_account[account.id]
                account.daily_change = RNG.randint(1_200, 9_000)

            await session.flush()
            return {
                "studio": 1,
                "branches": len(branches),
                "halls": len(halls),
                "services": len(services),
                "team": len(trainers),
                "clients": len(clients),
                "packages": len(package_rows),
                "lessons": lesson_count,
                "reservations": reservation_count,
            }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed the AURA multi-branch demo studio.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write the demo data; without this flag the script only explains how to run it",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    if not args.apply:
        print("No data written. Re-run with: python back/scripts/seed_aura_demo_studio.py --apply")
        return
    summary = await seed()
    print("AURA demo studio created successfully:")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    print(f"Demo staff password: {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
