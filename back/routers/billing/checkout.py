"""Создание оплаты тарифа: выбор тарифа/периода → подписка Stripe.

Подписка у студии ОДНА. Первый платёж её создаёт, последующие меняют её позицию
(тариф/период), а не заводят вторую. Сумму и срок считает Stripe по Price из
services/stripe_catalog.py — фронту и своим расчётам тут не доверяем.

Способ оплаты один — КАРТА, и нажатие «Оплатить» ведёт прямо на страницу Stripe.
Выбора способа, отдельного шага реквизитов и оплаты переводом больше нет.

Переход на другой тариф ВСЕГДА немедленный, с зачётом неиспользованного остатка
текущего периода (см. `_switch_now`). Отложенный переход «с начала следующего
периода» убран целиком: два поведения у одной кнопки владелец не различал.

Деньги идут на платформенный аккаунт Velora (services/stripe_billing.py), а не на
аккаунт студии — приём оплат клиентов студии живёт отдельно, в кассе.
"""
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ratelimit import limiter
from database import get_db
from dependencies import require_role, StudioContext
from models import StudioBillingPlan
from models.studio import Studio
from models.user import User
from schemas.settings.billing import (
    CheckoutRequest, CheckoutResponse, CheckoutPreviewRead, BillingProfileRead,
)
from services import stripe_billing, stripe_catalog
from .plans import (
    PLANS, PERIOD_DISCOUNTS, COMBO_PERCENT_RATE, amount_for, combo_amount_for, tier,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Вебхук Stripe бьёт в бэкенд, возврат пользователя — во фронт. Оба публичные.
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
_RETURN_URL = f"{WEB_APP_URL}/dashboard/billing?payment=return"

_NOT_CONFIGURED = {
    "code": "billing.stripe_not_configured",
    "message": "Приём оплат не настроен на сервере",
}
_STRIPE_ERROR = {
    "code": "billing.stripe_error",
    "message": "Stripe отклонил запрос",
}


def _validate(plan: str, period_months: int) -> None:
    # Literal в схеме уже отсекает мусор до сюда; страховка на случай рассинхрона каталога.
    if plan not in PLANS or period_months not in PERIOD_DISCOUNTS:
        raise HTTPException(status_code=422, detail="Неизвестный план или период")


async def _get_or_create_plan(db: AsyncSession, studio_id: int) -> StudioBillingPlan:
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if row is None:
        row = StudioBillingPlan(studio_id=studio_id, plan_name="none", status="none")
        db.add(row)
        await db.flush()
    return row


# Обязательные поля реквизитов. Список ОДИН на весь продукт: и «показывать ли
# форму перед оплатой» (фронт читает `filled`), и «слать ли адрес в Stripe»
# считаются по нему. Вторая строка адреса и VAT сюда не входят: у физлица номера
# НДС нет вовсе, и требовать его значило бы закрыть оплату всем, кроме компаний.
_PROFILE_REQUIRED = ("country", "line1", "postal_code", "city")


def billing_profile(user: User) -> BillingProfileRead:
    """Реквизиты плательщика с аккаунта + признак «заполнено».

    Живёт здесь, а не в router.py: главный потребитель — оформление оплаты ниже,
    а эндпоинты /billing/profile его только отдают наружу.
    """
    profile = BillingProfileRead(
        country=user.billing_country,
        line1=user.billing_line1,
        line2=user.billing_line2,
        postal_code=user.billing_postal_code,
        city=user.billing_city,
        vat_id=user.billing_vat_id,
    )
    profile.filled = all(getattr(profile, field) for field in _PROFILE_REQUIRED)
    return profile


async def _ensure_customer(
    db: AsyncSession, ctx: StudioContext, plan: StudioBillingPlan,
) -> str:
    """Stripe Customer студии + реквизиты плательщика с его АККАУНТА.

    Раньше адрес и VAT ID спрашивала только страница Checkout, а сюда не
    передавались вовсе — иначе каждая следующая оплата затирала бы введённое у
    Stripe. Теперь их собирает наша форма (модалка перед оплатой, правка во вкладке
    «Способ оплаты»), она и стала источником истины: заполненный профиль уезжает в
    Customer, Stripe Tax считает по нему ставку, а Checkout больше не переспрашивает
    страну и индекс. Профиль пустой (форму обошли старой вкладкой) — шлём как
    прежде только имя и почту, и реквизиты соберёт сама страница Checkout.

    VAT ID отправляется отдельным вызовом: у `Customer.modify` поля налогового
    номера нет, он живёт своим объектом. Сверку с VIES Stripe делает уже после
    оплаты, и не прошедший её номер снимается вебхуком И у Stripe, И у нас
    (webhook._handle_tax_id) — иначе следующее оформление заливало бы обратно ровно
    тот номер, который только что отклонили.
    """
    studio = (await db.execute(
        select(Studio).where(Studio.id == ctx.studio_id)
    )).scalar_one()
    profile = billing_profile(ctx.user)

    customer_id = await stripe_billing.ensure_customer(
        plan.stripe_customer_id,
        name=studio.name,
        email=studio.email or ctx.user.email,
        studio_id=ctx.studio_id,
        **(dict(
            country=profile.country,
            postal_code=profile.postal_code,
            city=profile.city,
            line1=profile.line1,
            line2=profile.line2,
        ) if profile.filled else {}),
    )
    if profile.filled and profile.vat_id:
        # Не роняем оплату: номер — не обязательное поле, а Stripe отбивает
        # неизвестный ему формат 400-й ошибкой. Без номера счёт выпишется с НДС,
        # что чинится порталом; сорванная оплата не чинится ничем.
        try:
            await stripe_billing.set_tax_id(customer_id, profile.vat_id)
        except Exception:
            logger.warning(
                "Stripe billing: VAT ID %s клиента %s не принят",
                profile.vat_id, customer_id, exc_info=True,
            )
    plan.stripe_customer_id = customer_id
    # Коммит СРАЗУ, а не вместе с ответом: дальше по обработчику есть выходы через
    # исключение (502 от Stripe), а get_db на исключении ничего не коммитит.
    # Потерянный customer_id значит, что следующая попытка заведёт студии ВТОРОГО
    # клиента — с чистой историей счетов и без реквизитов, введённых у Stripe.
    await db.commit()
    return customer_id


def _metadata(ctx: StudioContext, plan_id: str, period_months: int, mode: str = "subscription") -> dict:
    """Метаданные подписки. `plan`/`period_months` читает вебхук (mirror_invoice →
    _activate), поэтому они обязаны ехать при КАЖДОЙ смене Price, иначе продление
    вернёт студию на прежнюю ступень тарифа.

    `mode` — только диагностика в дашборде Stripe: ступень доступа от него не
    зависит (у комбо те же лимиты, что у одноимённой подписки)."""
    return {
        "studio_id": str(ctx.studio_id),
        "user_id": str(ctx.user.id),
        "plan": plan_id,
        "period_months": str(period_months),
        "billing_mode": mode,
    }


def _is_combo(plan: StudioBillingPlan, requested: bool | None = None) -> bool:
    """Тариф «фикс + процент» → подписка идёт по половинному Price.

    `requested` — что владелец выбрал ПРЯМО СЕЙЧАС (плитка модели в интерфейсе).
    Он главнее строки в БД, и это не дыра: `billing_mode` там поднимает ОПЛАТА
    (webhook._apply_paid_mode), а до неё поле описывает прошлое, а не покупку.
    Раньше комбо включалось отдельным запросом ДО оплаты — ровно так его и
    получали бесплатно (жалоба 14.08.2026).

    Половинную цену это не раздаёт. Комбо не скидка: вместе с ним включается
    обязательство платить процент с оборота, а на него `create_checkout` требует
    записанного согласия — без него 422, как и у `POST /billing/model`.

    `None` — режим не прислали (продление, легаси-клиент): берём то, что в БД.
    """
    return plan.billing_mode == "combo" if requested is None else requested


# Минимальный триал у Stripe — 48 часов. На более близкую дату Checkout Session
# отвечает «The `trial_end` date has to be at least 2 days in the future» и оплата
# срывается ЦЕЛИКОМ: владелец видит «платёжный сервис отклонил запрос» и не может
# купить тариф вообще. Час сверху — запас на дорогу запроса и расхождение часов.
_MIN_TRIAL = timedelta(days=2, hours=1)


def _trial_end(plan: StudioBillingPlan) -> int | None:
    """Миграция уже оплативших (спека §10): подписка стартует бесплатно до конца
    ранее оплаченного периода, и только потом начинает биллить.

    Студия, оплатившая по старой схеме (разовый платёж, перевод), не должна платить
    второй раз за уже оплаченный месяц, когда её первый раз заводят подпиской.
    Только для первой подписки: у существующей срок ведёт сам Stripe.

    Остаток КОРОЧЕ 48 часов округляем ВВЕРХ до минимума Stripe, а не выбрасываем
    триал. Разница в обе стороны меньше двух суток, и выбор такой:
      * округлить вверх — платформа дарит студии до двух суток;
      * отменить триал — студия ВТОРОЙ РАЗ платит за уже оплаченные дни.
    Второе — забрать чужие деньги из-за технического ограничения Stripe, поэтому
    берём первое. Регрессия живая (13.08.2026): без этого оплата падала 502.

    Сам минимум ОКРУГЛЯЕТСЯ ВВЕРХ до 10-минутной сетки — той же, по которой живёт
    ключ идемпотентности Checkout Session (stripe_billing.IDEMPOTENCY_WINDOW). Он
    считается от `now` и иначе меняется каждую секунду: два клика по «Оплатить»
    уходят в Stripe РАЗНЫМИ телами под ОДНИМ ключом, а на это Stripe отвечает
    IdempotencyError — владелец снова видит «платёжный сервис отклонил запрос»
    (живая жалоба 13.08.2026). Вверх, а не вниз: 48 часов у Stripe жёсткий
    минимум, и округление вниз вернуло бы ровно тот отказ, ради которого в
    _MIN_TRIAL взят запас в час.

    Оплаченный остаток округлять НЕ нужно и нельзя: `expires_at` и так постоянен
    между кликами, а сдвиг вверх дарил бы студии лишние минуты тарифа.
    """
    if plan.stripe_subscription_id is not None or plan.expires_at is None:
        return None
    now = datetime.utcnow()
    if plan.expires_at <= now:
        return None
    grid = stripe_billing.IDEMPOTENCY_WINDOW
    floor = int((now + _MIN_TRIAL).replace(tzinfo=timezone.utc).timestamp())
    floor = (floor + grid - 1) // grid * grid
    return max(int(plan.expires_at.replace(tzinfo=timezone.utc).timestamp()), floor)


def _has_live_subscription(plan: StudioBillingPlan) -> bool:
    """Подписка есть и она не мертва — тогда меняем её, а не заводим вторую."""
    return bool(plan.stripe_subscription_id) and plan.status in ("active", "past_due")


async def _forget_dead_subscription(db: AsyncSession, plan: StudioBillingPlan) -> None:
    """Снять ссылку на подписку, которой под текущим ключом Stripe нет.

    Зовётся ДО всех веток оформления, а не внутри них: и `_has_live_subscription`, и
    `_is_renewal`, и `_trial_end` читают одно поле `plan.stripe_subscription_id` —
    обнулив его в одном месте, мы разом переводим все три на путь «подписки нет,
    оформляем заново». Иначе `resource_missing` пришлось бы ловить в каждой ветке.

    `status` не трогаем: доступ к CRM висит на нём и на `expires_at`, и закрывать
    студии продукт из-за пропавшего объекта Stripe мы не вправе. Уже оплаченный
    остаток тоже не теряется — `_trial_end` отдаст новой подписке бесплатный старт
    до `expires_at`.
    """
    if not plan.stripe_subscription_id:
        return
    if await stripe_billing.subscription_exists(plan.stripe_subscription_id):
        return

    logger.warning(
        "Stripe billing: подписка %s не найдена под текущим ключом — оформляем заново",
        plan.stripe_subscription_id,
    )
    plan.stripe_subscription_id = None
    # Коммит сразу, по той же причине, что и в `_ensure_customer`: дальше по
    # обработчику есть выходы через исключение, а get_db на них не коммитит.
    await db.commit()


async def _live_plan_name(plan: StudioBillingPlan) -> str:
    """Тариф, который у студии ДЕЙСТВИТЕЛЬНО есть сейчас. Не ответил — наше зеркало.

    Считается по двум источникам, потому что каждый по отдельности врёт:

    * Price подписки Stripe отстаёт НАЗАД никогда, но убегает ВПЕРЁД: его двигает
      `change_subscription_price` в момент нажатия «Оплатить», а счёт-прорация
      висит `open`, пока не оплачен;
    * `plan_name` в нашей БД, наоборот, убегает вперёд никогда, но отстаёт: его
      поднимает вебхук по оплаченному счёту, а событие бывает в пути (или уходит
      на другой стенд) — 13.08.2026 из-за этого продление своего же Pro разобрали
      как смену тарифа и взяли полную цену, 99,07 €.

    Поэтому: ступень НИЖЕ нашей — верим Stripe сразу (там мы не дарим тариф, а
    перестаём отдавать лишнее). Ступень ВЫШЕ — только если за ней стоит оплаченный
    счёт (`subscription_settled`). Иначе неоплаченный Price выдавал бы себя за
    текущий тариф, и страница расходилась сама с собой: карточка тарифа (наше
    зеркало) показывала Pro, а модалка оплаты считала студию уже сидящей на
    Business — «продление» вместо перехода, без зачёта остатка. Живая жалоба
    14.08.2026, тот же корень, что у router._reconcile_plan_name.
    """
    if not plan.stripe_subscription_id:
        return plan.plan_name
    try:
        key = await stripe_billing.subscription_price_key(plan.stripe_subscription_id)
        parsed = stripe_catalog.parse_lookup_key(key)
        live = parsed[0] if parsed else plan.plan_name
        if tier(live) > tier(plan.plan_name) and not await stripe_billing.subscription_settled(
            plan.stripe_subscription_id
        ):
            logger.warning(
                "Stripe billing: подписка студии %s стоит на %s, но счёт за неё не оплачен — "
                "текущим тарифом считаем %s",
                plan.studio_id, live, plan.plan_name,
            )
            return plan.plan_name
        return live
    except Exception:
        # Сеть/Stripe прилегли: падать некуда — дальше по обработчику есть и
        # превью, и оформление. Зеркало хуже истины, но лучше отказа. Оно же
        # безопаснее по деньгам: ступень у него не выше оплаченной.
        logger.exception(
            "Stripe billing: тариф подписки %s не прочитан — берём зеркало",
            plan.stripe_subscription_id,
        )
        return plan.plan_name


def _is_renewal(plan: StudioBillingPlan, requested_plan: str, current_plan: str) -> bool:
    """Оплата ТОГО ЖЕ тарифа при живой подписке — это продление, а не смена.

    Ничего не зачитывается и ничего не сгорает: купленные месяцы ПРИБАВЛЯЮТСЯ к
    оплаченному сроку (webhook._activate → extend_subscription). Разбор такого
    платежа как смены тарифа начинал бы цикл заново и сжигал уже оплаченный
    остаток — студия платила бы и теряла деньги одним нажатием.

    Период при этом может отличаться: со «Старт помесячно» на «Старт на год» — это
    всё равно продление, просто следующие списания пойдут годовыми.

    `current_plan` — тариф ЖИВОЙ подписки (`_live_plan_name`), а не поле из нашей
    БД: сравнивать с отставшим зеркалом значит брать за продление полную цену.
    """
    return _has_live_subscription(plan) and requested_plan == current_plan


async def _renewal_invoice(
    db: AsyncSession, ctx: StudioContext, plan: StudioBillingPlan, customer_id: str,
    body_plan: str, period_months: int, combo: bool,
):
    """Счёт на продление уже оплаченного тарифа. Подписку НЕ трогает.

    Период добавляет вебхук по ОПЛАЧЕННОМУ счёту (webhook._activate → продление),
    и порядок здесь принципиален: сдвинуть дату сразу значило бы подарить месяцы
    всем, кто счёт не оплатит. Тот же принцип, что у всей остальной оплаты тарифа —
    ступень и срок поднимает только пришедшая оплата.

    Сумму считаем по каталогу (`amount_for`/`combo_amount_for`), а не Price'ом
    подписки: Price задаёт РЕКУРРЕНТНОЕ списание, а тут разовая покупка N месяцев.

    Способ оплаты берём У САМОЙ ПОДПИСКИ. Новые подписки все карточные, но у студий,
    заведённых по прежней схеме оплаты переводом, подписка до сих пор на
    `send_invoice` — им счёт должен уехать письмом, а не пытаться списаться с карты,
    которой у них нет. Поставь мы автосписание всем — такая студия получила бы счёт,
    который невозможно оплатить, и следом dunning от Stripe за своё же продление.
    """
    amount = (combo_amount_for if combo else amount_for)(body_plan, period_months)
    name = PLANS[body_plan]["name"]
    subscription = await stripe_billing.fetch_subscription(plan.stripe_subscription_id)
    collection_method = getattr(subscription, "collection_method", None) or "send_invoice"
    return await stripe_billing.create_fee_invoice(
        customer_id=customer_id,
        amount=amount,
        currency=stripe_billing.CURRENCY,
        description=f"Velora {name}: продление на {period_months} мес.",
        days_until_due=stripe_billing.DAYS_UNTIL_DUE,
        # Читает mirror_invoice: без kind="subscription" счёт не поднял бы тариф, а
        # renew_months говорит вебхуку, на сколько двигать дату.
        metadata={
            **_metadata(ctx, body_plan, period_months, "combo" if combo else "subscription"),
            "kind": "subscription",
            "renew_months": str(period_months),
        },
        collection_method=collection_method,
    )


async def _switch_now(
    db: AsyncSession, plan: StudioBillingPlan, customer_id: str, price_id: str,
    metadata: dict,
) -> str | None:
    """Немедленный переход на другой тариф → ссылка на выставленный счёт.

    Один-единственный сценарий смены тарифа, других больше нет. Правила ровно те,
    что владелец видел в модалке до нажатия (`preview_checkout` считает их тем же
    вызовом Stripe):

    1. неиспользованный остаток текущего периода зачитывается в новый счёт;
    2. доплачивается разница;
    3. если остаток БОЛЬШЕ новой цены (переход на тариф дешевле) — доплачивать
       нечего, а лишнее СГОРАЕТ (`drop_credit_balance`), о чём модалка предупредила.

    Сжигание — отдельным шагом после смены, а не режимом Stripe: у него такого
    режима нет вовсе. Оставить кредит на балансе значит подарить студии месяцы
    следующего периода поверх уже показанного ей «к оплате 0».
    """
    # Ранее запланированную смену снимаем: подписку под расписанием Stripe менять
    # отказывается. Новых расписаний мы не создаём, но у студий, успевших нажать
    # «с начала периода» по прежней схеме, оно ещё висит.
    await stripe_billing.release_schedule(plan.stripe_subscription_id)
    subscription = await stripe_billing.change_subscription_price(
        plan.stripe_subscription_id, price_id, metadata,
        proration_behavior="create_prorations", billing_cycle_anchor="now",
    )
    await stripe_billing.drop_credit_balance(customer_id)
    plan.scheduled_plan = None
    plan.scheduled_at = None
    await db.commit()

    invoice = getattr(subscription, "latest_invoice", None)
    if invoice is None:
        return None

    # Прорацию Stripe рождает ЧЕРНОВИКОМ, а у черновика нет ни номера, ни ссылки на
    # оплату. Без финализации владельца уносило по запасному адресу на пустую
    # страницу тарифа, доплата оставалась невидимым черновиком, вебхуку было не о
    # чем сообщать — и тариф не менялся никогда. Живая жалоба 13.08.2026: подписка
    # в Stripe уже на Pro, а в нашей БД по-прежнему business.
    invoice = await stripe_billing.ensure_finalized(invoice)

    # Импорт локальный — как и в create_checkout: webhook тянет пол-модели обратно.
    from .webhook import apply_status, mirror_invoice

    # Зеркалим счёт, как это делает продление: без строки в БД он не виден в истории
    # и его нельзя «сверить» вручную, если вебхук не дошёл.
    row = await mirror_invoice(db, plan, invoice)
    # Переход на тариф дешевле зачитывается остатком целиком — такой счёт Stripe
    # закрывает сам, и ждать вебхук ради уже случившегося незачем. Переход тот же,
    # что у вебхука и ручной сверки: ступень по-прежнему поднимает ОПЛАЧЕННЫЙ счёт,
    # а не факт нажатия кнопки. Сверка с metadata обязательна: `latest_invoice`
    # бывает и прошлым, уже оплаченным счётом — по нему activate вернул бы студию
    # на прежний тариф.
    if getattr(invoice, "status", None) == "paid" and row.plan_name == metadata.get("plan"):
        await apply_status(db, row, "paid")
    await db.commit()
    return getattr(invoice, "hosted_invoice_url", None)


@router.post("/checkout", response_model=CheckoutResponse)
# Каждый вызов заводит объекты у Stripe (Customer, Checkout Session, прорация).
# JWT сам по себе не потолок: угнанный токен владельца или зациклившийся ретрай
# фронта иначе упирается только в лимиты Stripe. Порог с запасом к живому
# сценарию — владелец жмёт «Оплатить» единицы раз, а не десятки.
@limiter.limit("10/minute")
async def create_checkout(
    request: Request,
    body: CheckoutRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Оплата тарифа картой. Три ветки, и ни в одной нет выбора «когда применить»:

    * подписки нет → страница Stripe Checkout, тариф начинается сразу;
    * тот же тариф → ПРОДЛЕНИЕ: счёт на N месяцев, срок прибавляется к текущему,
      ничего не сгорает (`_is_renewal`);
    * другой тариф → немедленный переход с зачётом остатка (`_switch_now`).
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    _validate(body.plan, body.period_months)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    combo = _is_combo(plan, body.combo)
    # Комбо несёт ОБЯЗАТЕЛЬСТВО платить процент с оборота, и оформить его без
    # подтверждённых условий нельзя — ровно как в `POST /billing/model`. Согласие
    # записано в строке плана (`percent_terms_rate`), а не выводится из флага в
    # теле: иначе модалку условий можно было бы обойти прямым запросом сюда.
    if combo and plan.percent_terms_rate != COMBO_PERCENT_RATE:
        raise HTTPException(status_code=422, detail={
            "code": "billing.offline_terms_required",
            "message": "Подтвердите условия постоплаты комиссии с офлайн-продаж",
        })

    customer_id = await _ensure_customer(db, ctx, plan)
    await _forget_dead_subscription(db, plan)

    metadata = _metadata(ctx, body.plan, body.period_months, "combo" if combo else "subscription")

    try:
        price_id = await stripe_catalog.price_id(body.plan, body.period_months, combo)
        if _is_renewal(plan, body.plan, await _live_plan_name(plan)) and combo == (
            plan.billing_mode == "combo"
        ):
            # Продление своего же тарифа В ТОЙ ЖЕ МОДЕЛИ: выставляем счёт, подписку
            # не трогаем. Смена модели на том же тарифе продлением НЕ является —
            # у комбо другой Price, и его надо именно переставить (_switch_now).
            stripe_invoice = await _renewal_invoice(
                db, ctx, plan, customer_id, body.plan, body.period_months, combo,
            )
            from .webhook import mirror_invoice

            await mirror_invoice(db, plan, stripe_invoice)
            await db.commit()
            # Ссылка на счёт, а не на Checkout Session: платить нужно именно его, а
            # у автосписания страница ещё и покажет результат списания.
            return CheckoutResponse(
                checkout_url=getattr(stripe_invoice, "hosted_invoice_url", None)
                or f"{WEB_APP_URL}/dashboard/billing",
            )

        if _has_live_subscription(plan):
            # url = None значит «доплачивать нечего»: смена уже применена, счёта
            # для оплаты нет. Подставлять сюда адрес своей же страницы нельзя —
            # это была бы перезагрузка вместо результата (и уход на боевой домен,
            # когда WEB_APP_URL смотрит на прод).
            url = await _switch_now(db, plan, customer_id, price_id, metadata)
            return CheckoutResponse(checkout_url=url)

        session_id, url = await stripe_billing.create_subscription_checkout(
            customer_id=customer_id,
            price_id=price_id,
            metadata=metadata,
            success_url=_RETURN_URL,
            cancel_url=f"{WEB_APP_URL}/dashboard/billing",
            trial_end=_trial_end(plan),
        )
    except HTTPException:
        raise
    except Exception as exc:
        # studio_id в строке: без него в логе видно «оплата не создана» и трейс, но
        # не у кого именно она не создалась — а искать это приходится под жалобу.
        logger.exception(
            "Stripe billing: оплата картой не создана (студия %s, тариф %s/%s мес.)",
            ctx.studio_id, body.plan, body.period_months,
        )
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    await db.commit()
    return CheckoutResponse(checkout_url=url)


@router.get("/checkout/preview", response_model=CheckoutPreviewRead)
# Каждый вызов — запрос к Stripe. Фронт зовёт его при открытии модалки и при смене
# тарифа/периода внутри неё, то есть единицы раз, а не потоком.
@limiter.limit("30/minute")
async def preview_checkout(
    request: Request,
    plan: str = Query(...),
    period_months: int = Query(...),
    # Модель, выбранную ПРЯМО СЕЙЧАС, а не ту, что записана в БД: расчёт должен
    # показывать цену того, что владелец покупает. Согласия здесь не требуем —
    # превью только считает, деньги берёт `create_checkout`, он и гейтит.
    combo: bool = Query(False),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Что спишется за переход на выбранный тариф — ДО нажатия «Оплатить».

    Цифры считает тот же вызов Stripe, которым потом и выставится счёт
    (`preview_price_change` ↔ `change_subscription_price` с теми же аргументами):
    показать здесь свою арифметику значит однажды разойтись с реально списанным.

    Суммы БЕЗ налога — как и весь остальной интерфейс: цены каталога заданы
    `tax_behavior="exclusive"`, а ставку знает только Stripe Tax по стране и
    статусу плательщика (у бизнеса из другой страны ЕС это вовсе 0 %).

    Ошибка Stripe здесь НЕ 502: превью — это подпись под кнопкой, а не платёж.
    Отдаём честную цену без зачёта, чтобы модалка открылась и оплата осталась
    возможной; занизить итог такой фолбэк не может, только показать его полным.
    """
    _validate(plan, period_months)
    row = await _get_or_create_plan(db, ctx.studio_id)
    combo = _is_combo(row, combo)
    gross = (combo_amount_for if combo else amount_for)(plan, period_months)
    currency = stripe_billing.CURRENCY.upper()

    if not stripe_billing.configured() or not _has_live_subscription(row):
        # Подписки нет — но оплаченный остаток (триал, прежний период) может быть, и
        # тогда списывать начнут не сегодня: `_trial_end` даёт новой подписке
        # бесплатный старт до его конца. Считаем ТЕМ ЖЕ вызовом, что и оформление,
        # иначе модалка однажды пообещает дату, отличную от настоящей.
        starts_at = _trial_end(row)
        free_at = datetime.utcfromtimestamp(starts_at) if starts_at else None
        return CheckoutPreviewRead(
            kind="new", gross=gross, credit=0, total=gross, burned=0, currency=currency,
            free_until=free_at.isoformat() if free_at else None,
            # Вверх по календарю: пока дата не наступила, «остался 1 день» честнее нуля.
            free_days=(
                -((-(free_at - datetime.utcnow()).total_seconds()) // 86400)
                if free_at else 0
            ),
        )

    # Тариф ЖИВОЙ подписки, а не наше зеркало: и решение «продление или смена», и
    # подпись «Ваш тариф X — зачёт» должны совпадать с тем, за что Stripe считает
    # деньги. Иначе отставший вебхук показывает зачёт остатка Business, а списывает
    # полную цену Pro (жалоба 13.08.2026).
    current_name = await _live_plan_name(row)

    # Тот же тариф, но ДРУГАЯ модель — это смена, а не продление: у комбо свой
    # Price. Условие обязано совпадать с create_checkout, иначе модалка обещает
    # продление, а списывается переход.
    if _is_renewal(row, plan, current_name) and combo == (row.billing_mode == "combo"):
        # Продление: зачитывать нечего и сжигать нечего — купленные месяцы
        # прибавляются к оплаченному сроку.
        return CheckoutPreviewRead(
            kind="renewal", current_plan=current_name, gross=gross, credit=0,
            total=gross, burned=0, currency=currency,
        )

    try:
        price_id = await stripe_catalog.price_id(plan, period_months, combo)
        gross, credit = await stripe_billing.preview_price_change(
            row.stripe_subscription_id, price_id,
        )
    except Exception:
        logger.exception("Stripe billing: превью перехода студии %s не посчитано", ctx.studio_id)
        return CheckoutPreviewRead(
            kind="switch", current_plan=current_name, gross=gross, credit=0,
            total=gross, burned=0, currency=currency, estimated=True,
        )

    return CheckoutPreviewRead(
        kind="switch",
        current_plan=current_name,
        gross=gross,
        credit=credit,
        total=max(0, gross - credit),
        # Зачёт больше новой цены — разница сгорит (drop_credit_balance).
        burned=max(0, credit - gross),
        currency=currency,
    )


@router.post("/payment-method/setup", response_model=CheckoutResponse)
@limiter.limit("10/minute")
async def setup_payment_method(
    request: Request,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Привязать карту без списания — по желанию студии, не как условие доступа.

    Гейт percent-студию пускает и БЕЗ карты (dependencies.require_active_subscription):
    счёт за офлайн-комиссию выставляется на оплату вручную, а не списывается
    (services/offline_fee_billing). Карта тут — удобство: с ней Stripe закроет
    ежемесячный счёт сам. До этого эндпоинта она появлялась только как побочный
    эффект оплаты подписки (webhook._sync_card), которой у «процента» нет.

    Клиент Stripe заводится здесь же — он нужен и для будущего перехода на
    подписку, и как владелец привязанного способа оплаты.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    customer_id = await _ensure_customer(db, ctx, plan)

    try:
        _session_id, url = await stripe_billing.create_setup_checkout(
            customer_id=customer_id,
            success_url=f"{WEB_APP_URL}/dashboard/billing?card=added",
            cancel_url=f"{WEB_APP_URL}/dashboard/billing",
        )
    except Exception as exc:
        logger.exception("Stripe billing: страница привязки карты не создана")
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    return CheckoutResponse(checkout_url=url)


@router.post("/portal", response_model=CheckoutResponse)
@limiter.limit("10/minute")
async def open_billing_portal(
    request: Request,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Клиентский портал Stripe: студия сама правит VAT ID, адрес и карту.

    ЕДИНСТВЕННОЕ место, где номер НДС можно ввести после первой покупки. Поля VAT
    есть только у Checkout Session, а он открывается, пока подписки нет; дальше
    студия видит страницу счёта (продление) или результат смены тарифа, и ввести
    номер там негде — компания, купившая тариф как физлицо, навсегда оставалась без
    reverse charge.

    Ответ переиспользует `CheckoutResponse`: это та же «ссылка на страницу Stripe»,
    что у привязки карты, и заводить под один URL вторую схему незачем.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    customer_id = await _ensure_customer(db, ctx, plan)

    try:
        url = await stripe_billing.create_portal_session(
            customer_id, return_url=f"{WEB_APP_URL}/dashboard/billing",
        )
    except Exception as exc:
        logger.exception("Stripe billing: портал для студии %s не открыт", ctx.studio_id)
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    return CheckoutResponse(checkout_url=url)


@router.post("/renew", deprecated=True)
async def renew(_ctx: StudioContext = Depends(require_role("owner"))):
    """Продление теперь делает Stripe само.

    410, а не удаление маршрута: текущий фронт ещё зовёт этот эндпоинт, и внятный
    код отказа читается лучше, чем 404 на «пропавшем» пути.

    Гейт на owner оставлен, хотя тело ответа от роли не зависит: остальной
    /billing — owner-only (require_active_subscription + require_role), и этот
    маршрут не повод делать в разделе биллинга анонимную дыру.
    """
    raise HTTPException(status_code=410, detail={
        "code": "billing.renew_is_automatic",
        "message": "Подписка продлевается автоматически",
    })
