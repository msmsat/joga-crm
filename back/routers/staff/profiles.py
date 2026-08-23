from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_role, StudioContext
from models import (
    Hall, Lesson, Reservation, Service, StaffDayOverride, StaffWorkingHours,
    Studio, StudioMember, User,
)
from schemas import (
    StaffCreate, StaffUpdate,
    StaffListResponse, StaffProfileResponse, StaffMutateResponse,
)
from schemas.staff.staff import StaffWorkingHoursItem
from security import get_password_hash
from services.contacts import (
    ensure_user_contacts_free, normalize, normalized_column,
)
from services.invites import send_invite
from services.members import full_name
from services.notifier import notify
from services.plan_limits import check_plan_limit

router = APIRouter()


# ─── HELPERS ──────────────────────────────────────────────────────────────────

async def _get_staff_member(
    staff_id: int, studio_id: int, db: AsyncSession
) -> tuple[User, StudioMember]:
    result = await db.execute(
        select(User, StudioMember)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id, User.id == staff_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return row[0], row[1]


async def _studio_of(studio_id: int, db: AsyncSession) -> Studio:
    """Студия для письма-приглашения — нужны её название, лого и язык."""
    return (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one()


async def _membership_of(
    user_id: int, studio_id: int, db: AsyncSession
) -> Optional[StudioMember]:
    result = await db.execute(
        select(StudioMember).where(
            StudioMember.user_id == user_id,
            StudioMember.studio_id == studio_id,
        )
    )
    return result.scalars().first()


async def _resolve_services(service_ids: list[int], studio_id: int, db: AsyncSession) -> list[Service]:
    """Услуги по id, скоуп студии. Чужой/несуществующий id → 404."""
    if not service_ids:
        return []
    result = await db.execute(
        select(Service).where(Service.id.in_(service_ids), Service.studio_id == studio_id)
    )
    services = result.scalars().all()
    if len(services) != len(set(service_ids)):
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    return list(services)


def _apply_studio_services(user: User, studio_id: int, services: list[Service]) -> None:
    """Услуги ЭТОЙ студии заменяем, чужие оставляем нетронутыми.

    `user.services` — глобальная коллекция аккаунта, и присваивание целиком
    стёрло бы услуги человека в другой студии (услуги скоупятся через
    Service.studio_id). Требует загруженного `user.services`.
    """
    user.services = [s for s in user.services if s.studio_id != studio_id] + services


async def _replace_schedule(
    user_id: int, studio_id: int, schedule: list[StaffWorkingHoursItem], db: AsyncSession
) -> None:
    """Полная замена графика сотрудника В ЭТОЙ студии (пришёл список — он и есть истина).

    Скоуп по studio_id обязателен: у человека, работающего в двух студиях, два
    независимых графика, и правка одной студией не должна затирать другую
    (docs/ROADMAP_ACCOUNTS, решение 7).
    """
    await db.execute(
        delete(StaffWorkingHours).where(
            StaffWorkingHours.user_id == user_id,
            StaffWorkingHours.studio_id == studio_id,
        )
    )
    for item in schedule:
        db.add(StaffWorkingHours(
            user_id=user_id,
            studio_id=studio_id,
            day_of_week=item.day_of_week,
            is_open=item.is_open,
            open_time=item.open_time,
            close_time=item.close_time,
        ))

    await _resync_future_day_marks(user_id, studio_id, db)


async def _resync_future_day_marks(user_id: int, studio_id: int, db: AsyncSession) -> None:
    """Снимает будущие отметки дней — под новый график их проставят заново.

    Убрали день из графика — он не должен остаться отмеченным рабочим (и наоборот:
    добавленный день отметится при следующем открытии месяца, routers/staff/schedule.py).
    Дни, куда уже записались клиенты, не трогаем: там сначала надо разобраться с
    записями. Прошлое тоже не трогаем — оно не редактируется вовсе.
    """
    booked_days = (
        select(func.date(Lesson.start_time))
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(
            Lesson.teacher_id == user_id,
            Lesson.studio_id == studio_id,
            Lesson.status != "cancelled",
            Reservation.status != "cancelled",
        )
    )
    await db.execute(
        delete(StaffDayOverride).where(
            StaffDayOverride.user_id == user_id,
            StaffDayOverride.studio_id == studio_id,
            StaffDayOverride.day >= date.today(),
            StaffDayOverride.day.not_in(booked_days),
        )
    )


def _is_online(user: User) -> bool:
    """Онлайн = сегодня заходил в CRM (задача 12); полночь сбрасывает статус сама."""
    return user.last_online_at == date.today()


def _staff_list_item(user: User, membership: StudioMember) -> dict:
    """Контакты — с аккаунта, профиль в студии (имя, фото, роль) — с membership."""
    return {
        "id": user.id,
        # Имя и фото — студийные: как владелец назвал человека у СЕБЯ в команде.
        # Личное имя аккаунта (user.name) сюда не течёт (решение 9).
        "name": membership.name,
        "last_name": membership.last_name,
        "email": user.email,
        "phone": user.phone,
        "role": membership.role,
        "department": membership.department,
        "is_online": _is_online(user),
        # Активен = принял приглашение В ЭТУ студию. Не `user.is_verified`: у
        # человека с уже готовым аккаунтом Velora он давно true, но в этой
        # команде его ещё нет, пока он не согласился (решение 10).
        "is_active": membership.status == "active",
        "photo_url": membership.photo_url,
        "avatar_gradient": user.avatar_gradient,
    }


# ─── GET /staff/ ──────────────────────────────────────────────────────────────

@router.get("/", response_model=StaffListResponse)
async def list_staff(
    # Страница «Сотрудники» — владельцу (ТЗ 2.5), но список нужен и Журналу:
    # это его колонки-тренеры. Админу — вся команда, тренеру — только он сам:
    # состав студии его не касается, а своя колонка в сетке нужна.
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=100),
):
    studio_id = ctx.studio_id

    stmt = (
        select(User, StudioMember)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id)
        .order_by(StudioMember.name)
    )
    if ctx.role == "trainer":
        stmt = stmt.where(StudioMember.user_id == ctx.user.id)

    result = await db.execute(stmt)
    rows = result.all()

    # summary считаем по всей студии, страницу вырезаем из уже загруженных строк.
    # ponytail: срез в Python ок на десятках сотрудников; тысячи — тогда offset/limit в SQL.
    by_role: dict[str, int] = {}
    online_count = 0
    for u, sm in rows:
        by_role[sm.role] = by_role.get(sm.role, 0) + 1
        if _is_online(u):
            online_count += 1

    page_rows = rows[offset:offset + limit]
    staff_items = [_staff_list_item(u, sm) for u, sm in page_rows]

    return {
        "summary": {
            "total": len(rows),
            "online": online_count,
            "by_role": by_role,
        },
        "staff": {
            "items": staff_items,
            "total": len(rows),
            "offset": offset,
            "limit": limit,
        },
    }


# ─── GET /staff/check-contact ─────────────────────────────────────────────────
# Объявлен до /{staff_id}, иначе FastAPI пытается прочитать «check-contact» как int.

@router.get("/check-contact")
async def check_staff_contact(
    field: Literal["email", "phone"],
    value: str,
    exclude_id: Optional[int] = Query(None, description="Кого не считать — правимый сотрудник"),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Два разных факта об одном контакте — форма берёт нужный ей.

    `taken` — контакт принадлежит какому-то аккаунту продукта. И для email, и для
    телефона это ОШИБКА: оба уникальны глобально, второй аккаунт с ними создать
    нельзя, а подставлять вместо введённых данных уже существующего человека
    create_staff больше не будет (см. его комментарий).

    `in_studio` — этот контакт принадлежит человеку, который уже работает в этой
    студии. Отдельный признак нужен ради текста ошибки: «уже у вас в команде»
    объясняет ситуацию, а «email занят» в этом случае только путает.
    """
    normalized = normalize(field, value)
    if normalized is None:
        return {"taken": False, "in_studio": False}

    query = select(User.id).where(normalized_column(User, field) == normalized)
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    user_id = (await db.execute(query.limit(1))).scalars().first()
    if user_id is None:
        return {"taken": False, "in_studio": False}

    in_studio = await _membership_of(user_id, ctx.studio_id, db) is not None
    return {"taken": True, "in_studio": in_studio}


# ─── GET /staff/{staff_id} ────────────────────────────────────────────────────

@router.get("/{staff_id}", response_model=StaffProfileResponse)
async def get_staff_profile(
    staff_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    user, membership = await _get_staff_member(staff_id, studio_id, db)

    services_result = await db.execute(
        select(Service)
        .join(Service.users)
        .where(User.id == staff_id, Service.studio_id == studio_id)
    )
    services = [{"id": s.id, "name": s.name} for s in services_result.scalars().all()]

    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = today_start + timedelta(days=1)
    month_ago = datetime.now() - timedelta(days=90)

    # Total bookings & attended
    bookings_result = await db.execute(
        select(Reservation.status, func.count(Reservation.id))
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Lesson.teacher_id == staff_id, Lesson.studio_id == studio_id)
        .group_by(Reservation.status)
    )
    bookings_by_status: dict[str, int] = {row[0]: row[1] for row in bookings_result.all()}
    total_bookings = sum(v for k, v in bookings_by_status.items() if k != "cancelled")
    total_attended = bookings_by_status.get("attended", 0)

    # Load % — ratio of booked seats vs total seats over next 4 weeks.
    #
    # Двумя запросами, а не одним с outer join: в join'е строка занятия
    # повторялась на каждую бронь, и SUM(total_spots) складывал одни и те же
    # места по многу раз. Знаменатель раздувало в среднее число броней на
    # занятие — при 8 занятиях по 8 мест и 48 бронях выходило 384 места вместо
    # 64, и владелец видел 13% там, где реально 75%.
    # Регрессия: tests/test_staff_load_percent.py.
    load_window_end = datetime.now() + timedelta(weeks=4)
    load_window = (
        Lesson.teacher_id == staff_id,
        Lesson.studio_id == studio_id,
        Lesson.start_time >= datetime.now(),
        Lesson.start_time <= load_window_end,
        Lesson.status != "cancelled",
    )
    total_spots = (await db.execute(
        select(func.sum(Lesson.total_spots)).where(*load_window)
    )).scalar() or 0
    booked_spots = (await db.execute(
        select(func.count(Reservation.id))
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.status != "cancelled", *load_window)
    )).scalar() or 0
    load_percent = round(booked_spots / total_spots * 100) if total_spots > 0 else 0

    # Total revenue — sum of price × attended reservations per lesson
    revenue_result = await db.execute(
        select(func.sum(Lesson.price))
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Reservation.status == "attended",
        )
    )
    total_revenue = revenue_result.scalar() or 0

    # Halls used in last 90 days
    halls_result = await db.execute(
        select(Hall)
        .join(Lesson, Lesson.hall_id == Hall.id)
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Lesson.start_time >= month_ago,
        )
        .distinct(Hall.id)
    )
    halls = [
        {"id": h.id, "name": h.name, "color": h.color}
        for h in halls_result.scalars().all()
    ]
    # Today's schedule
    today_lessons_result = await db.execute(
        select(Lesson)
        .options(selectinload(Lesson.hall), selectinload(Lesson.reservations))
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Lesson.start_time >= today_start,
            Lesson.start_time < today_end,
            Lesson.status != "cancelled",
        )
        .order_by(Lesson.start_time)
    )
    today_schedule = []
    for lesson in today_lessons_result.scalars().all():
        booked = sum(1 for r in lesson.reservations if r.status != "cancelled")
        today_schedule.append({
            "id": lesson.id,
            "name": lesson.name,
            "start_time": lesson.start_time.strftime("%H:%M"),
            "duration_min": lesson.duration_min,
            "booked_count": booked,
            "total_spots": lesson.total_spots,
            "hall": {"id": lesson.hall.id, "name": lesson.hall.name, "color": lesson.hall.color}
            if lesson.hall else None,
        })

    # Weekly working hours — только этой студии: в другой у него свой график.
    wh_result = await db.execute(
        select(StaffWorkingHours)
        .where(
            StaffWorkingHours.user_id == staff_id,
            StaffWorkingHours.studio_id == studio_id,
        )
        .order_by(StaffWorkingHours.day_of_week)
    )
    week_working_hours = [
        {
            "day_of_week": wh.day_of_week,
            "is_open": wh.is_open,
            "open_time": wh.open_time,
            "close_time": wh.close_time,
        }
        for wh in wh_result.scalars().all()
    ]

    return {
        "id": user.id,
        "name": membership.name,
        "last_name": membership.last_name,
        "email": user.email,
        "phone": user.phone,
        "role": membership.role,
        # Имя, фото, должность и деньги — профиль и условия В ЭТОЙ студии, поэтому
        # с membership. avg_rating остаётся с аккаунта: это оценка человека.
        "department": membership.department,
        "is_online": _is_online(user),
        "is_active": membership.status == "active",
        "photo_url": membership.photo_url,
        "avatar_gradient": user.avatar_gradient,
        "salary": membership.salary,
        "rate": membership.rate,
        "rate_type": membership.rate_type,
        "avg_rating": user.avg_rating,
        "stats": {
            "total_bookings": total_bookings,
            "total_attended": total_attended,
            "load_percent": load_percent,
            "total_revenue": total_revenue,
        },
        "halls": halls,
        "services": services,
        "today_schedule": today_schedule,
        "week_working_hours": week_working_hours,
    }


# ─── POST /staff/ ─────────────────────────────────────────────────────────────

@router.post("/", status_code=201, response_model=StaffMutateResponse)
async def create_staff(
    data: StaffCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await check_plan_limit(db, studio_id, "staff")

    services = await _resolve_services(data.service_ids, studio_id, db)

    # Аккаунт с таким email уже есть → это ТОТ ЖЕ человек, а не ошибка: имя и
    # фото теперь студийные, и владельцу есть куда положить введённое — в
    # membership, не трогая чужую личность (docs/ROADMAP_ACCOUNTS, решения 8 и 9).
    # Ошибка остаётся ровно одна — человек уже в этой команде.
    user = (await db.execute(
        select(User)
        .options(selectinload(User.services))
        .where(normalized_column(User, "email") == normalize("email", data.email))
    )).scalars().first()

    if user is not None:
        if await _membership_of(user.id, studio_id, db) is not None:
            raise HTTPException(status_code=409, detail="Этот человек уже работает в вашей студии")
        # Телефон формой больше не спрашивается, но если пришёл — он обязан быть
        # свободен или уже принадлежать этому же аккаунту.
        await ensure_user_contacts_free(db, phone=data.phone, exclude_id=user.id)
        # Личное не трогаем: пароль, email, телефон и имя аккаунта принадлежат
        # человеку. Пароль из формы здесь просто игнорируется — на /join этот
        # сотрудник войдёт своим (services/invites.py, ветка lead_existing).
        _apply_studio_services(user, studio_id, services)
    else:
        if not data.password:
            raise HTTPException(status_code=400, detail="Задайте пароль для нового сотрудника")
        await ensure_user_contacts_free(db, email=data.email, phone=data.phone)
        user = User(
            email=data.email,
            # Личное имя нового аккаунта = то, что ввёл владелец: другого
            # источника нет, человек в продукте впервые. Дальше он правит его
            # у себя в профиле, и на подпись в студии это не влияет.
            name=data.name,
            last_name=data.last_name,
            phone=data.phone,
            photo_url=data.photo_url,
            # Пароль от владельца — он же второй фактор на странице приглашения.
            # В письмо он не попадает никогда (services/invites.py): иначе
            # ссылка и секрет ехали бы одним каналом и смысл пары пропал.
            hashed_password=get_password_hash(data.password),
            # Вход закрыт, пока сотрудник не активировался по ссылке: пароль сам
            # по себе не пускает, а карточка в списке остаётся серой.
            is_verified=False,
            is_onboarded=True,      # онбординг только для владельца новой студии
            services=services,
        )
        db.add(user)
        await db.flush()

    membership = StudioMember(
        user_id=user.id,
        studio_id=studio_id,
        # Приглашение, а не зачисление: доступ к студии человек получит, только
        # приняв его по ссылке из письма (routers/auth/invite.py).
        status="pending",
        role=data.role,
        name=data.name,
        last_name=data.last_name,
        photo_url=data.photo_url,
        department=data.department,
        salary=data.salary,
        rate=data.rate,
        rate_type=data.rate_type,
    )
    db.add(membership)
    await _replace_schedule(user.id, studio_id, data.schedule, db)
    await db.commit()
    await db.refresh(user)
    await db.refresh(membership)

    await notify(db, studio_id, "owner", "o5", {
        "staff_name": full_name(membership),
    })

    studio = await _studio_of(studio_id, db)
    invite_url = await send_invite(user, studio, membership.role, name=membership.name)
    return {"ok": True, "staff": _staff_list_item(user, membership), "invite_url": invite_url}


# ─── POST /staff/{staff_id}/invite ────────────────────────────────────────────

@router.post("/{staff_id}/invite", response_model=StaffMutateResponse)
async def resend_invite(
    staff_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Отправить приглашение повторно (письмо не дошло, ссылка протухла).

    Ссылка — новый токен от текущего момента, а не тот же самый: у прежнего
    свой `exp`, и «отправить повторно» на седьмой день иначе прислало бы
    мёртвую ссылку.
    """
    user, membership = await _get_staff_member(staff_id, ctx.studio_id, db)
    studio = await _studio_of(ctx.studio_id, db)
    invite_url = await send_invite(user, studio, membership.role, name=membership.name)
    return {"ok": True, "staff": _staff_list_item(user, membership), "invite_url": invite_url}


# ─── PUT /staff/{staff_id} ────────────────────────────────────────────────────

@router.put("/{staff_id}", response_model=StaffMutateResponse)
async def update_staff(
    staff_id: int,
    data: StaffUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    user_result = await db.execute(
        select(User, StudioMember)
        .join(StudioMember, StudioMember.user_id == User.id)
        .options(selectinload(User.services))
        .where(StudioMember.studio_id == studio_id, User.id == staff_id)
    )
    row = user_result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    user, membership = row

    # Контакты — это сам аккаунт, а не карточка в студии. Менять их вправе только
    # владелец собственных контактов и студия, которая этот аккаунт завела и он
    # ещё не активирован. Иначе владелец студии Б переписал бы email тренера,
    # работающего в студии А, и увёл бы аккаунт себе.
    contacts_changed = data.email != user.email or data.phone != user.phone
    if contacts_changed and user.id != ctx.user.id and user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Email и телефон принадлежат аккаунту сотрудника — их меняет он сам в профиле",
        )

    # Проверяем только изменённые контакты: в БД остались исторические дубли по email
    # (docs/ROADMAP_ACCOUNTS, решение 3 — чистка), и на них нельзя запирать правку
    # остальных полей карточки. Новый конфликт при этом ввести всё равно нельзя.
    await ensure_user_contacts_free(
        db,
        email=data.email if data.email != user.email else None,
        phone=data.phone if data.phone != user.phone else None,
        exclude_id=staff_id,
    )

    services = await _resolve_services(data.service_ids, studio_id, db)

    role_changed = data.role is not None and membership.role != data.role

    user.email = data.email
    user.phone = data.phone
    _apply_studio_services(user, studio_id, services)
    # Профиль и условия работы — в membership этой студии. У человека, работающего
    # ещё где-то, там своё имя, своя ставка и своя должность — они не меняются.
    membership.name = data.name
    membership.last_name = data.last_name
    membership.photo_url = data.photo_url
    membership.department = data.department
    membership.salary = data.salary
    membership.rate = data.rate
    membership.rate_type = data.rate_type
    if data.role is not None:
        membership.role = data.role
    await _replace_schedule(user.id, studio_id, data.schedule, db)
    await db.commit()
    await db.refresh(user)

    if role_changed:
        await notify(db, studio_id, "owner", "o7", {
            "staff_name": full_name(membership),
            "role": data.role,
        })

    return {"ok": True, "staff": _staff_list_item(user, membership)}


# ─── DELETE /staff/{staff_id} ─────────────────────────────────────────────────

@router.delete("/{staff_id}", response_model=dict)
async def delete_staff(
    staff_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    _, membership = await _get_staff_member(staff_id, studio_id, db)

    if membership.role == 'owner':
        owner_count_result = await db.execute(
            select(func.count()).select_from(StudioMember)
            .where(StudioMember.studio_id == studio_id, StudioMember.role == 'owner')
        )
        if owner_count_result.scalar_one() <= 1:
            raise HTTPException(status_code=403, detail="Нельзя удалить единственного владельца студии")

    await db.delete(membership)
    await db.commit()

    return {"ok": True}
