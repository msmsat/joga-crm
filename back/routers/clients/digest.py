"""Сводка по клиенту для карточки в Журнале: визиты, неявки, отзывы, привычки.

Одна серверная операция над всеми записями клиента, а не обход карточкой
профиля, событий и отзывов по отдельности: неявок нет ни в одном из тех
ответов, а «любимого тренера» пришлось бы считать на фронте по неполному списку.
"""
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, ClientPayment, ClientSubscription, Lesson, Reservation, Studio, StudioReview
from routers.clients._scope import client_scope
from schemas.clients.digest import ClientDigest
from services import lesson_time

router = APIRouter()

HISTORY_LIMIT = 12
REVIEWS_LIMIT = 5


def _status(reservation_status: str, start, now, no_show: bool = False) -> str:
    if reservation_status == "attended":
        return "attended"
    if reservation_status == "cancelled":
        return "cancelled"
    # Неявка — только отмеченная (services/attendance): посещение по умолчанию
    # «пришёл». Впереди — ждём; началось и не отмечено «не пришёл» — пришёл
    # (по окончании занятия система отметит это и в статусе брони).
    if no_show:
        return "missed"
    if start >= now:
        return "upcoming"
    # Неподтверждённая студией заявка визитом не становится — как и раньше.
    return "attended" if reservation_status == "active" else "missed"


@router.get("/{client_id}/digest", response_model=ClientDigest)
async def get_client_digest(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
):
    client_id_found = (await db.execute(
        select(Client.id).where(Client.id == client_id, *client_scope(ctx))
    )).scalar_one_or_none()
    if client_id_found is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    studio = await db.get(Studio, ctx.studio_id)
    now = lesson_time.local_now(studio)

    rows = (await db.execute(
        select(
            Reservation.id, Reservation.status, Reservation.no_show, Reservation.rating, Reservation.review_text,
            Reservation.is_trial, Lesson.id.label("lesson_id"), Lesson.name, Lesson.start_time,
            Lesson.teacher_name, Lesson.status.label("lesson_status"),
            # Как записан и чем закрыт — то же, что у строки записанного в Журнале.
            Reservation.created_at.label("booked_at"), Lesson.price,
            Reservation.trial_discount_percent, Reservation.payment_breakdown.label("payment"),
            ClientSubscription.type.label("subscription_name"),
            func.coalesce(case((ClientPayment.status == "pending", ClientPayment.amount), else_=0), 0).label("debt"),
            func.coalesce(case((ClientPayment.status == "success", ClientPayment.amount), else_=0), 0).label("paid_amount"),
        )
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .outerjoin(ClientPayment, ClientPayment.id == Reservation.debt_payment_id)
        .outerjoin(ClientSubscription, ClientSubscription.id == Reservation.subscription_id)
        .where(
            Reservation.client_id == client_id,
            Lesson.studio_id == ctx.studio_id,
            # hold — неоплаченная попытка записи картой, записью она не стала.
            Reservation.status != "hold",
        )
        .order_by(Lesson.start_time.desc())
    )).mappings().all()

    visits = []
    for r in rows:
        # Отменённое студией занятие — не отмена и не неявка клиента.
        status = "cancelled" if r["lesson_status"] == "cancelled" else _status(r["status"], r["start_time"], now, r["no_show"])
        visits.append({
            "reservation_id": r["id"], "lesson_id": r["lesson_id"], "name": r["name"],
            "start_time": r["start_time"], "teacher_name": r["teacher_name"] or None,
            "status": status, "rating": r["rating"], "review_text": r["review_text"],
            "is_trial": r["is_trial"], "booked_at": r["booked_at"], "price": r["price"],
            "trial_discount_percent": r["trial_discount_percent"],
            "subscription_name": r["subscription_name"], "debt": r["debt"],
            "paid_amount": r["paid_amount"], "payment": r["payment"],
        })

    counts = Counter(v["status"] for v in visits)
    attended = [v for v in visits if v["status"] == "attended"]
    held = counts["attended"] + counts["missed"]
    ratings = [v["rating"] for v in visits if v["rating"]]
    upcoming = [v for v in visits if v["status"] == "upcoming"]

    def favorite(key: str) -> str | None:
        top = Counter(v[key] for v in attended if v[key]).most_common(1)
        return top[0][0] if top else None

    reviews = (await db.execute(
        select(StudioReview.rating, StudioReview.text, StudioReview.created_at)
        .where(StudioReview.studio_id == ctx.studio_id, StudioReview.client_id == client_id)
        .order_by(StudioReview.created_at.desc())
        .limit(REVIEWS_LIMIT)
    )).mappings().all()

    return ClientDigest(
        attended=counts["attended"], missed=counts["missed"],
        cancelled=counts["cancelled"], upcoming=counts["upcoming"],
        attendance_rate=round(counts["attended"] * 100 / held) if held else None,
        avg_rating=round(sum(ratings) / len(ratings), 1) if ratings else None,
        first_visit=attended[-1]["start_time"].date() if attended else None,
        last_visit=attended[0]["start_time"].date() if attended else None,
        favorite_trainer=favorite("teacher_name"),
        favorite_lesson=favorite("name"),
        # Ближайшая впереди — последняя в списке «новые сверху».
        next_visit=upcoming[-1] if upcoming else None,
        # Предстоящие тоже: «записан за столько-то, ещё не оплачено» важно и
        # до занятия. Новые сверху, поэтому ближайшие будущие идут первыми.
        history=visits[:HISTORY_LIMIT],
        reviews=[dict(r) for r in reviews],
    )
