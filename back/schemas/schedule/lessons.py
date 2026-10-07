from datetime import datetime
from typing import Any, List, Optional, Literal

from pydantic import Field, model_validator

from schemas._base import BaseSchema
from schemas.photos import NotePhotos


class LessonRead(BaseSchema):
    id: int
    name: str
    teacher_name: str
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: datetime
    duration_min: int
    price: int
    level: str
    equipment: str
    total_spots: int
    service_id: Optional[int] = None
    service_color: Optional[str] = None
    status: str
    booked_count: int = 0
    # Сколько записанных отмечены «пришёл» (только в списке занятий журнала).
    attended_count: int = 0
    # Отмеченные «не пришёл» — по ним сетка рисует неявку.
    no_show_count: int = 0
    # Записанные с непогашенным долгом или неоплаченной картой (только в списке).
    unpaid_count: int = 0
    # Клиент индивидуальной записи: сетка подписывает карточку его именем.
    # У группового занятия — None (только в списке).
    client_name: Optional[str] = None
    client_color: Optional[str] = None
    cancel_reason: Optional[str] = None
    # Отменённое занятие убрано из сетки Журнала — само оно и брони на него
    # остаются в истории. Сетка такие не рисует, отчёты по-прежнему считают.
    hidden_at: Optional[datetime] = None
    # Внутренняя заметка студии о занятии и снимки к ней. Клиенту не уходят
    # ни одним каналом — ни в мини-приложение, ни в напоминания.
    notes: str = ""
    photos: List[str] = []
    source_status: Optional[str] = None
    clients_notified: bool = False
    # HB-02/04: снимок механики и филиала. `branch_id` синхронизируется с
    # Hall.branch_id роутером при создании/переносе (routers/schedule/lessons.py)
    # — для hall-less занятия остаётся None, догадкой не заполняется (§6.1).
    branch_id: Optional[int] = None
    booking_mode: str = "event"
    tz_iana: Optional[str] = None
    # Версия интервала: журнал отправляет её как expected_version при переносе
    # индивидуальной записи (§6.5). У event не используется.
    version: int = 1
    # Буферы услуги, снятые в занятие при создании (время на подготовку и
    # уборку). Журнал рисует их рядом с карточкой: мастер в это время занят,
    # и записать к нему нельзя (services/resource_slots).
    buffer_before_min: int = 0
    buffer_after_min: int = 0

    # Загружается из ORM-связи, но не сериализуется — резерв для подсчёта booked_count,
    # если эндпоинт не посчитал его сам (напр. через selectinload вместо GROUP BY).
    reservations: List[Any] = Field(default_factory=list, exclude=True, repr=False)

    @model_validator(mode="after")
    def _fill_booked_count(self) -> "LessonRead":
        # Единое правило подсчёта по всему проекту: занятое место — любая бронь,
        # кроме отменённой (active + attended). См. staff/schedule.py.
        # Если эндпоинт уже проставил booked_count (GROUP BY, без N+1) — уважаем его.
        if not self.booked_count and self.reservations:
            self.booked_count = sum(1 for r in self.reservations if r.status != "cancelled")
        return self


class LessonDaysResponse(BaseSchema):
    """Ответ GET /schedule/lessons/days — даты месяца с неотменёнными занятиями
    (точки мини-календаря в Журнале, задача 5 V4-5)."""
    days: List[str]


class PaymentBreakdownLine(BaseSchema):
    kind: str
    amount: int


class PaymentBreakdown(BaseSchema):
    """Чем оплачено занятие — снимок кассы в момент оплаты
    (services/reservation_payment.snapshot). Суммы — в валюте студии."""
    base_price: int = 0
    discounts: List[PaymentBreakdownLine] = []
    promo_code: Optional[str] = None
    bonuses_applied: int = 0
    bonuses_value: int = 0
    deposit_applied: int = 0
    certificate_applied: int = 0
    certificate_code: Optional[str] = None
    total: int = 0
    # cash / transfer / stripe (карта онлайн).
    method: Optional[str] = None
    paid_at: Optional[datetime] = None
    # Оплата перенесена импортом из прошлой системы — «Поменять» у стойки её
    # не отменяет (services/reservation_refund.refusal).
    migration_basis: Optional[str] = None


class BookedClient(BaseSchema):
    reservation_id: int
    client_id: int
    name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_color: Optional[str] = None
    spot_number: Optional[int] = None
    status: str
    # Imported historical completion does not establish attendance.
    attendance_known: bool = True
    # Первое занятие клиента — в Журнале помечается «Пробное». За бесплатное
    # денег никто не ждёт; у первого занятия со скидкой рядом стоит её процент.
    is_trial: bool = False
    # Скидка первого занятия, обещанная при записи: процент (100 — бесплатно)
    # или сумма — тогда процента нет. У старых пробных броней снимка нет — это
    # были подарки, то есть 100 %.
    trial_discount_percent: Optional[int] = None
    trial_discount_amount: Optional[int] = None
    # Сколько клиент должен за это занятие («оплата на месте»). 0 — покрыто
    # абонементом, подарено или уже оплачено.
    debt: int = 0
    # Сколько уже заплачено за это занятие на месте (погашенный долг). Вместе с
    # `debt` и `by_subscription` отличает «оплачено» от «платить было нечего».
    paid_amount: int = 0
    # Занятие списано с абонемента клиента.
    by_subscription: bool = False
    # Откуда пришла запись (crm, miniapp, ai…) и когда.
    booking_channel: Optional[str] = None
    booked_at: Optional[datetime] = None
    # Оценка и отзыв клиента об ЭТОМ занятии (мини-приложение после визита).
    rating: Optional[int] = None
    review_text: Optional[str] = None
    # «Кофе после занятия»: клиент согласился остаться с группой.
    coffee: bool = False
    # Название абонемента, с которого списано занятие.
    subscription_name: Optional[str] = None
    # Чем оплачено: скидки, баллы, депозит, сертификат, способ. None — денег не
    # брали или оплачено до появления снимка (тогда есть только paid_amount).
    payment: Optional[PaymentBreakdown] = None
    # Скидка администратора, данная брони при записи без оплаты: окно оплаты
    # открывается уже с ней, долг посчитан с ней же.
    manual_discount_percent: Optional[int] = None
    # Посещение: явная отметка «не пришёл» и долг, погашенный системой по
    # окончании занятия (services/attendance). До начала занятия неотмеченный
    # ждёт, с начала — считается пришедшим.
    no_show: bool = False
    auto_paid: bool = False


class LessonLocation(BaseSchema):
    """Где проходит занятие: зал, филиал и его адрес. Без филиала адрес берётся
    из карточки студии — у студии с одним местом филиалов часто нет вовсе."""
    hall_name: Optional[str] = None
    branch_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None


class LessonCompensation(BaseSchema):
    kind: Literal["owner", "percent", "hourly", "salary", "unconfigured"]
    amount: Optional[float] = None
    base_amount: Optional[float] = None
    rate: Optional[float] = None
    duration_min: int


class LessonDetail(LessonRead):
    compensation: Optional[LessonCompensation] = None
    booked_clients: List[BookedClient] = Field(default_factory=list)
    location: Optional[LessonLocation] = None


class EligibleClient(BaseSchema):
    """Клиент, которого администратор может записать на занятие, и чем будет
    покрыта его запись — те же основания, что у `services/booking.FundingKind`:
    абонемент, первое занятие, бесплатное по прайсу или оплата на месте."""
    id: int
    name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_color: Optional[str] = None
    funding: Literal["subscription", "trial", "free", "pay"]
    # Сколько занятий останется на абонементе ДО этой записи.
    classes_left: Optional[int] = None
    # Скидка первого занятия: процент (100 — бесплатно, меньше — остаток
    # платится на месте) или сумма в валюте студии.
    trial_percent: Optional[int] = None
    trial_amount: Optional[int] = None


class LessonCreate(BaseSchema):
    name: str
    teacher_name: str
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: datetime
    duration_min: int = 60
    price: int
    level: str
    equipment: str
    total_spots: int = 8
    service_id: Optional[int] = None
    status: str = "confirmed"


class LessonCreateRequest(BaseSchema):
    """Тело POST /schedule/lessons. teacher_name и name НЕ принимаем —
    денормализуются из teacher_id/service_id на сервере. Диапазоны (total_spots
    1–50, конец позже начала) проверяет эндпоинт как 400 — по контракту.
    price/level/equipment опциональны: квик-форма создания занятия в Журнале
    их не собирает (только услуга/зал/время/лимит/тренер). price=None —
    «взять из карточки услуги» (как и name), а не «занятие бесплатное»:
    иначе мини-приложение показывало 0 ₽ на платной хатхе."""
    service_id: int
    teacher_id: int
    hall_id: Optional[int] = None
    # Филиал занятия. С залом его называть незачем — он берётся из зала, и
    # присланное значение обязано совпасть (иначе 409). Нужен он там, где
    # места не участвуют в расписании (барбершоп: запись к мастеру, не к
    # креслу): иначе событие в студии с двумя филиалами остаётся без филиала,
    # потому что вывести его больше не из чего.
    branch_id: Optional[int] = None
    start_time: datetime
    duration_min: int = 60
    total_spots: int = 8
    price: Optional[int] = None
    level: str = ""
    equipment: str = ""
    # Необязательная заметка: форма создания её спрашивает, но не требует.
    notes: str = ""
    photos: NotePhotos = []


class LessonUpdateRequest(BaseSchema):
    """Тело PATCH /schedule/lessons/{id}. Все поля опциональны — меняем только
    присланные (см. exclude_unset). teacher_name пересчитываем из teacher_id,
    name — из service_id."""
    service_id: Optional[int] = None
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    branch_id: Optional[int] = None
    start_time: Optional[datetime] = None
    duration_min: Optional[int] = None
    total_spots: Optional[int] = None
    price: Optional[int] = None
    cancel_reason: Optional[str] = None
    notes: Optional[str] = None
    # None — «фото не трогать»: правка одного текста не должна стирать снимки.
    photos: Optional[NotePhotos] = None


class LessonCancelRequest(BaseSchema):
    """Тело PATCH /schedule/lessons/{id}/cancel — причина необязательна."""
    reason: Optional[str] = None


class LessonUpdate(BaseSchema):
    name: Optional[str] = None
    teacher_name: Optional[str] = None
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: Optional[datetime] = None
    duration_min: Optional[int] = None
    price: Optional[int] = None
    level: Optional[str] = None
    equipment: Optional[str] = None
    total_spots: Optional[int] = None
    service_id: Optional[int] = None
    status: Optional[str] = None
