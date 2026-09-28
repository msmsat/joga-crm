from datetime import date, datetime
from typing import Literal, Optional

from schemas._base import BaseSchema
from schemas.schedule.lessons import PaymentBreakdown


class DigestVisit(BaseSchema):
    """Одна запись клиента: занятие, чем кончилась, что он о нём сказал."""
    reservation_id: int
    lesson_id: int
    name: str
    start_time: datetime
    teacher_name: Optional[str] = None
    # attended — пришёл; missed — записан, но не отмечен после начала (неявка);
    # cancelled — отменил; upcoming — занятие ещё впереди.
    status: Literal["attended", "missed", "cancelled", "upcoming"]
    rating: Optional[int] = None
    review_text: Optional[str] = None
    is_trial: bool = False
    # Как записан и чем закрыт: цена занятия, скидка первого занятия, абонемент,
    # долг или оплата со снимком кассы.
    booked_at: Optional[datetime] = None
    price: int = 0
    trial_discount_percent: Optional[int] = None
    subscription_name: Optional[str] = None
    debt: int = 0
    paid_amount: int = 0
    payment: Optional[PaymentBreakdown] = None


class DigestReview(BaseSchema):
    """Отзыв о студии (раздел «Отзывы»), оставленный этим клиентом."""
    rating: int
    text: Optional[str] = None
    created_at: datetime


class ClientDigest(BaseSchema):
    """Всё, что стоит вспомнить о клиенте перед занятием, одним ответом.

    Считается сервером по всем записям разом — без него карточка ходила бы
    за профилем, событиями и отзывами по отдельности и всё равно не знала бы
    неявок: их нет ни в одном из этих ответов."""
    attended: int = 0
    missed: int = 0
    cancelled: int = 0
    upcoming: int = 0
    # Доля пришедших среди состоявшихся записей (пришёл + неявка), 0…100.
    # None — состоявшихся записей ещё не было.
    attendance_rate: Optional[int] = None
    avg_rating: Optional[float] = None
    first_visit: Optional[date] = None
    last_visit: Optional[date] = None
    favorite_trainer: Optional[str] = None
    favorite_lesson: Optional[str] = None
    next_visit: Optional[DigestVisit] = None
    # Последние записи, новые сверху, включая предстоящие (не больше HISTORY_LIMIT).
    history: list[DigestVisit] = []
    reviews: list[DigestReview] = []
