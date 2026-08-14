from typing import Annotated, Literal, Optional

from pydantic import BaseModel, BeforeValidator, Field, field_validator

from schemas._base import BaseSchema


def _blank_to_none(value: object) -> object:
    """Пустая строка из формы = «не заполнено», а не значение из пробелов."""
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


OptTrimmed = Annotated[Optional[str], BeforeValidator(_blank_to_none)]


class PlanLimits(BaseSchema):
    staff: Optional[int] = None   # None = безлимит (business)
    clients: Optional[int] = None
    # Обращений к ИИ в месяц (эпик AI-5). У Business это число, а не безлимит:
    # «безлимит сотрудников» и «безлимит расходов платформы» — разные обещания.
    # Второй ключ каталога, ai_cost_micro, сюда НЕ выносится: это себестоимость
    # платформы, показывать её студии незачем (лишние ключи Pydantic игнорирует).
    ai_requests: Optional[int] = None


class PlanRead(BaseSchema):
    id: str            # start | pro | business
    name: str
    price: int         # месячная цена в копейках
    limits: PlanLimits


class PlansCatalogRead(BaseSchema):
    """Каталог тарифов — единственный источник истины о ценах и лимитах."""
    plans: list[PlanRead]
    period_discounts: dict[int, float]   # {1: 0, 6: 0.20, 12: 0.30, 24: 0.40}
    # Валюта подписки (BILLING_CURRENCY), а НЕ валюта кассы студии: тарифы всегда
    # списываются в валюте Stripe-аккаунта, чем бы студия ни торговала у себя.
    currency: str                        # ISO-код, например EUR
    # Минимальный месячный платёж тарифа «только процент» (младшие единицы).
    # Отдаётся каталогом, а не хардкодится на фронте: сумма из него попадает в
    # модалку согласия, и разъехаться с plans.MIN_MONTHLY_FEE она не должна —
    # владелец подтверждает конкретную цифру.
    min_monthly: int
    # Ставка НДС для ПОДПИСИ итога на шаге оплаты, %. Цены выше — без налога
    # (tax_behavior=exclusive), налог накидывается сверху.
    #
    # Ориентир, а не источник суммы: настоящую ставку считает Stripe Tax по стране
    # покупателя и его статусу плательщика (у студии из другой страны ЕС с валидным
    # номером НДС это вовсе 0 % — reverse charge). Считать итог по этому числу на
    # фронте нельзя, им можно только подписать «включая НДС N%».
    vat_rate: float = 21.0


class BillingPlanRead(BaseSchema):
    plan_name: str
    billing_cycle: str
    status: str
    expires_at: Optional[str] = None
    max_staff: int
    auto_renewal: bool
    billing_mode: str = "subscription"
    percent_rate: Optional[float] = None
    fixed_base_amount: Optional[int] = None
    notify_before_days: int = 3
    notify_before_autocharge: bool = True
    email_receipt_enabled: bool = True
    sms_notification_enabled: bool = False
    can_upgrade: bool = False          # считает сервер (задача 2) — фронту не доверяем ветвистость
    next_plan: Optional[str] = None    # None, если апгрейда нет (% от оборота / максимальный тариф)
    # Оплаченная, но ещё не наступившая смена тарифа: апгрейд по умолчанию начинается
    # с конца текущего оплаченного периода, и владелец должен видеть, что его ждёт.
    scheduled_plan: Optional[str] = None
    scheduled_at: Optional[str] = None
    # Есть ли у студии ЖИВАЯ подписка Stripe — тот же признак, по которому ветвится
    # оформление (checkout._has_live_subscription), а не `status`. Считает сервер, и
    # это принципиально: фронт по нему решает, показывать ли выбор «сейчас / с начала
    # периода». Выведенный из одного `status` признак расходился с сервером у студии,
    # оплатившей по старой схеме или потерявшей подписку при смене ключа Stripe, —
    # интерфейс предлагал отложенный переход, сервер отвечал обычной ссылкой оплаты, и
    # владельца молча уносило на страницу Stripe мимо выбора способа оплаты.
    has_live_subscription: bool = False
    # Открыта ли ещё акция «14 дней бесплатно». Считает сервер по тому же правилу,
    # по которому пускает POST /billing/trial (router._trial_available), — иначе
    # кнопка и эндпоинт разошлись бы, и владелец жал бы то, что вернёт 409.
    # Закрывается первой оплатой и самой выдачей триала, навсегда.
    trial_available: bool = False


class AutopaySettingsUpdate(BaseModel):
    auto_renewal: Optional[bool] = None
    email_receipt_enabled: Optional[bool] = None
    notify_before_autocharge: Optional[bool] = None
    sms_notification_enabled: Optional[bool] = None


class ActivateModelRequest(BaseModel):
    mode: Literal["subscription", "percent", "combo"]
    plan: Optional[Literal["start", "pro", "business"]] = None
    period_months: Optional[Literal[1, 6, 12, 24]] = None
    # Явное согласие на постоплату комиссии. Обязательно для mode="percent":
    # без него бэк отвечает 422, и модалку подтверждения нельзя обойти запросом.
    accept_offline_terms: bool = False


class OfflineFeeStatus(BaseModel):
    """Виджет «Комиссия с офлайн-продаж» в разделе «Тариф и оплата»."""
    accrued: int            # начислено, но ещё не выставлено (младшие единицы)
    accrued_currency: str
    outstanding: int        # выставлено и не оплачено, в валюте биллинга
    currency: str
    due_at: Optional[str] = None        # крайний срок по самому раннему счёту
    days_left: Optional[int] = None     # сколько дней осталось; <0 — просрочено
    suspended: bool = False             # доступ уже заблокирован
    # Чем именно заблокирован: "offline_fee" — комиссия с наличных, "min_fee" —
    # минимальный месячный платёж процентного тарифа. Тексты у них разные.
    suspended_reason: Optional[str] = None
    hosted_invoice_url: Optional[str] = None
    rate: Optional[float] = None
    grace_days: int = 7
    # Минимальный месячный платёж (младшие единицы валюты биллинга). Заполнен
    # только на тарифе «только процент» — остальным он не выставляется.
    min_monthly: Optional[int] = None


class BillingStatsRead(BaseSchema):
    """Плашки шапки биллинга — считаются из оплаченных счетов студии, не из констант."""
    total_spent: int                      # копейки, сумма paid-счетов
    months_with_us: int                   # полных месяцев с первой оплаты (0 — оплат не было)
    saved: int                            # копейки, экономия от скидок за период
    next_charge: int                      # копейки, следующее списание (0 — списывать нечего)
    next_charge_at: Optional[str] = None


class InvoiceRead(BaseSchema):
    id: int
    plan_name: str
    period_months: int
    amount: int
    payment_method: Optional[str] = None
    paid_at: Optional[str] = None
    status: str
    pdf_url: Optional[str] = None


class PaymentCardRead(BaseSchema):
    id: int
    card_last4: str
    card_brand: str
    card_expiry: str
    cardholder_name: Optional[str] = None
    is_primary: bool
    method_type: str = "card"


class BillingProfileRead(BaseSchema):
    """Реквизиты плательщика — АККАУНТА, а не студии (models/user.py).

    Отдаются как есть плюс `filled`: считать «заполнено ли» на фронте значит
    повторять там список обязательных полей, а он ровно один — здесь.
    """
    country: Optional[str] = None      # ISO 3166-1 alpha-2
    line1: Optional[str] = None
    line2: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    vat_id: Optional[str] = None
    filled: bool = False


class BillingProfileUpdate(BaseModel):
    """Форма реквизитов. Обязательно всё, кроме второй строки адреса и VAT.

    Минимум для Stripe Tax — страна и индекс, но фактура юрлица без улицы и города
    не документ, а платят у нас в основном студии-юрлица. Поэтому спрашиваем полный
    адрес сразу: доспрашивать его потом было бы негде — форма показывается один раз.
    """
    # Код страны, а не название: в Stripe уезжает именно он, а названия у нас
    # переводятся на двух языках и в БД разъехались бы.
    country: str
    line1: str = Field(min_length=2, max_length=200)
    line2: OptTrimmed = Field(default=None, max_length=200)
    postal_code: str = Field(min_length=2, max_length=20)
    city: str = Field(min_length=1, max_length=100)
    vat_id: OptTrimmed = Field(default=None, max_length=30)

    @field_validator("country")
    @classmethod
    def _upper_country(cls, value: str) -> str:
        # Длину проверяем здесь, а не через Field: constraint отработал бы ДО
        # strip, и « cz » из формы улетал бы в 422 за «слишком длинно».
        value = value.strip().upper()
        if len(value) != 2 or not value.isalpha():
            raise ValueError("Код страны — две латинские буквы")
        return value

    @field_validator("line1", "postal_code", "city")
    @classmethod
    def _trim(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Поле обязательно")
        return value

    @field_validator("vat_id")
    @classmethod
    def _canon_vat(cls, value: Optional[str]) -> Optional[str]:
        # Пробелы, точки и дефисы в номере пишут все по-разному, а Stripe и VIES
        # ждут слитную строку: «CZ 123 456 789» иначе не проходит сверку.
        if value is None:
            return None
        return "".join(ch for ch in value.upper() if ch.isalnum())


class CheckoutRequest(BaseModel):
    plan: Literal["start", "pro", "business"]
    period_months: Literal[1, 6, 12, 24]
    # Покупается комбо (фикс÷2 + % с оборота), а не чистая подписка. Раньше это
    # решалось по `billing_mode` в БД, а тот включался ОТДЕЛЬНЫМ запросом до оплаты —
    # то есть комбо доставалось нажатием кнопки. Теперь режим поднимает оплата
    # (webhook._apply_paid_mode), и до неё сказать «беру комбо» можно только здесь.
    # Половинную цену это не раздаёт: комбо — не скидка, а другая модель, и вместе
    # с ней включается обязательство платить процент с оборота, на которое сервер
    # требует записанного согласия (checkout.create_checkout).
    combo: bool = False
    # Поля `apply` тут больше нет: переход ВСЕГДА немедленный, с зачётом остатка
    # текущего периода (routers/billing/checkout._switch_now). Отложенный переход
    # «с начала следующего периода» убран — владелец не различал два поведения
    # одной кнопки, а расчёт зачёта делает выбор ненужным.


class CheckoutResponse(BaseModel):
    # null — платить нечего (переход на тариф дешевле зачёлся остатком целиком):
    # вести владельца некуда, и фронт остаётся на странице тарифа, обновив данные.
    # Раньше сюда подставлялся адрес самой страницы биллинга, и вместо результата
    # человек получал перезагрузку — а с боевым WEB_APP_URL ещё и уход на прод.
    checkout_url: str | None = None


class CheckoutPreviewRead(BaseSchema):
    """Что спишется за выбранный тариф — расчёт для модалки оплаты, ДО платежа.

    Суммы в младших единицах и БЕЗ налога: цены каталога заданы
    `tax_behavior="exclusive"`, а ставку считает Stripe Tax по стране и статусу
    плательщика уже на своей странице.
    """
    # new — подписки нет, платится полная цена; renewal — тот же тариф, месяцы
    # прибавляются к сроку; switch — смена тарифа с зачётом остатка.
    kind: Literal["new", "renewal", "switch"]
    current_plan: Optional[str] = None
    gross: int      # полная цена выбранного тарифа за период
    credit: int     # зачёт неиспользованного остатка текущего периода
    total: int      # к оплате сейчас = max(0, gross − credit)
    burned: int     # сколько зачёта СГОРИТ (зачёт больше новой цены — переход вниз)
    currency: str
    # true — Stripe не ответил, и зачёт в расчёт не попал: показана полная цена.
    # Фронт по этому признаку не обещает владельцу точную сумму.
    estimated: bool = False
    # До какой даты новая подписка НЕ БЕРЁТ денег (ISO). Это не подарок платформы,
    # а уже оплаченный студией остаток — триала или прежнего периода: подписка
    # стартует бесплатно до его конца (checkout._trial_end), и только потом биллит.
    # Без этой строки модалка показывала сумму так, будто спишут её сегодня, и
    # владелец не понимал, за что платит второй раз. None — платится сразу.
    free_until: Optional[str] = None
    # Сколько дней осталось до первого списания. Считает сервер — тем же часами,
    # которыми выбрана сама дата: на фронте это была бы арифметика от Date.now()
    # в рендере, то есть значение, меняющееся между перерисовками.
    free_days: int = 0


class RenewResponse(BaseModel):
    invoice_id: int
