from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from schemas._base import BaseSchema


class BookingCreate(BaseSchema):
    lesson_id: int


class ReservationPaymentOptions(BaseSchema):
    """Чем ещё, кроме денег, закрывается долг за занятие у стойки.

    `manual_discount_percent` — скидка, которую администратор дал от себя. Идёт
    в общий ряд скидок (services/pricing.resolve_price): действует самая
    выгодная клиенту, без стека. Баллы и депозит списываются после скидок —
    тот же порядок, что у кассы. None — скидка, данная брони при записи
    (`Reservation.manual_discount_percent`), 0 — без скидки администратора."""
    manual_discount_percent: Optional[int] = Field(default=None, ge=0, le=100)
    use_bonuses: bool = False
    use_deposit: bool = False
    # Скидка первого занятия, обещанная брони при записи. Администратор может
    # её не засчитать — тогда бронь перестаёт быть пробной (как у
    # индивидуальной записи с выключенным «Первым занятием»).
    first_lesson: bool = True
    # Промокод и подарочный сертификат — те же, что у кассы и индивидуальной
    # записи (routers/checkout._quote). Пустая строка — кода нет.
    promo_code: Optional[str] = Field(default=None, max_length=64)
    certificate_code: Optional[str] = Field(default=None, max_length=64)


class ReservationPaymentDiscount(BaseSchema):
    kind: Literal["studio", "offer", "promo", "referral", "first_lesson", "manual"]
    amount: int


class ReferralSummary(BaseSchema):
    """Приглашения клиента для окна оплаты (services/referral.summary)."""
    # Кто привёл клиента (имя пригласившего), None — пришёл сам.
    invited_by: Optional[str] = None
    # Скидка новичка по приглашению ещё не использована — её снимет расчёт цены.
    discount_percent: Optional[int] = None
    # Скольких друзей привёл сам клиент.
    invited_count: int = 0
    # Что студия дарит пригласившему за друга: сумма и её вид (points/deposit/discount).
    invite_bonus: Optional[int] = None
    invite_bonus_type: Optional[str] = None


class ReservationPaymentPreview(BaseSchema):
    """Чек погашения долга строками — тот же расчёт, что проведёт оплата."""
    currency: str
    base_price: int
    # Долг, выставленный при записи. Итог может отличаться: скидки и баллы
    # пересчитываются в момент оплаты.
    debt: int
    discounts: list[ReservationPaymentDiscount] = []
    # Скидка администратора, по которой посчитан чек: названная сейчас или
    # данная брони при записи.
    manual_discount_percent: Optional[int] = None
    # Ручная скидка введена, но выгоднее оказалась другая: не суммируются.
    manual_outweighed: bool = False
    # Бронь записана пробной — у чека есть выключатель «Первое занятие».
    first_lesson_offered: bool = False
    first_lesson_applied: bool = False
    # Размер скидки первого занятия: процент ИЛИ сумма — второе поле пустое.
    first_lesson_percent: Optional[int] = None
    first_lesson_amount: Optional[int] = None
    # Промокод: None — не вводили, False — не принят; принят, но проиграл
    # более выгодной скидке — promo_outweighed.
    promo_valid: Optional[bool] = None
    promo_outweighed: bool = False
    # Код ошибки сертификата (loyalty.cert_*) — чек при этом посчитан без него.
    certificate_error: Optional[str] = None
    certificate_amount: int = 0
    certificate_applied: int = 0
    bonuses_available: int = 0
    bonuses_applied: int = 0
    bonuses_value: int = 0
    point_value: int = 1
    deposit_available: int = 0
    deposit_applied: int = 0
    # Кешбэк студии в процентах (None — выключен) и сколько баллов упадёт
    # клиенту за эту оплату: курс программы лояльности плюс кешбэк.
    cashback_percent: Optional[int] = None
    points_to_earn: int = 0
    referral: Optional[ReferralSummary] = None
    total: int


class ReservationPayRequest(ReservationPaymentOptions):
    """Оплата на месте: клиент отдал деньги на ресепшене.

    Карты здесь нет намеренно — «card» в кассе означает эквайринг Stripe, и
    проводится он вебхуком после реального списания, а не нажатием кнопки
    (routers/checkout/router.perform_pay). На ресепшене реальны наличные и
    перевод; терминал студии проводится через кассу, как и раньше.
    """
    payment_method: Literal["cash", "transfer"] = "cash"
    # Счёт студии, на который лечь доходу. Не выбран — дефолтный по способу
    # оплаты (наличные → касса, перевод → расчётный счёт).
    account_id: Optional[int] = None
    # Итог, который видел администратор. Сервер считает заново и при
    # расхождении не проводит ничего (409 checkout.amount_changed). Не передан —
    # проверки нет (ассистент и старые клиенты).
    expected_total: Optional[int] = Field(default=None, ge=0)


class ReservationCreate(BaseSchema):
    client_id: int
    lesson_id: int


class AttendanceUpdate(BaseSchema):
    """Отметка студии: пришёл (true) или не пришёл (false). Деньги следуют за
    ней сами (services/attendance.mark)."""
    attended: bool


class ReservationRead(BaseSchema):
    id: int
    client_id: int
    lesson_id: int
    spot_number: Optional[int] = None
    status: str
    # Явная отметка «не пришёл» (статус при ней остаётся active).
    no_show: bool = False
    # Долг погашен системой по окончании занятия — «не пришёл» откатит его сам.
    auto_paid: bool = False
    booking_channel: Optional[str] = None
    created_at: datetime
