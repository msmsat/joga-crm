"""Создание оплаты тарифа: выбор тарифа/периода → подписка Stripe.

Подписка у студии ОДНА. Первый платёж её создаёт, последующие меняют её позицию
(тариф/период), а не заводят вторую. Сумму и срок считает Stripe по Price из
services/stripe_catalog.py — фронту и своим расчётам тут не доверяем.

Деньги идут на платформенный аккаунт Velora (services/stripe_billing.py), а не на
аккаунт студии — приём оплат клиентов студии живёт отдельно, в кассе.
"""
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ratelimit import limiter
from database import get_db
from dependencies import require_role, StudioContext
from models import StudioBillingPlan
from models.studio import Studio
from schemas.settings.billing import (
    CheckoutRequest, CheckoutResponse,
    IbanCheckoutRequest, IbanCheckoutResponse,
)
from services import stripe_billing, stripe_catalog
from .plans import PLANS, PERIOD_DISCOUNTS

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


async def _ensure_customer(
    db: AsyncSession, ctx: StudioContext, plan: StudioBillingPlan, *, require_country: bool,
) -> str:
    """Stripe Customer студии с актуальными реквизитами.

    `require_country` — для IBAN-ветки: хостед-страницы, где Stripe соберёт адрес
    сам, там нет, а без страны Stripe Tax не посчитает ставку.
    """
    studio = (await db.execute(
        select(Studio).where(Studio.id == ctx.studio_id)
    )).scalar_one()

    if require_country and not studio.country:
        raise HTTPException(status_code=422, detail={
            "code": "billing.tax_details_required",
            "message": "Заполните страну студии в настройках — без неё счёт не выставить",
        })

    customer_id = await stripe_billing.ensure_customer(
        plan.stripe_customer_id,
        name=studio.name,
        email=studio.email or ctx.user.email,
        country=studio.country,
        postal_code=studio.postal_code,
        city=None,
        line1=studio.address,
        vat_id=studio.vat_id,
        company_id=studio.company_id,
        studio_id=ctx.studio_id,
    )
    plan.stripe_customer_id = customer_id
    # Коммит СРАЗУ, а не вместе с ответом: дальше по обработчику есть выходы через
    # исключение (502 от Stripe, 409 «доплачивать нечего»), а get_db на исключении
    # ничего не коммитит. Потерянный customer_id значит, что следующая попытка
    # заведёт студии ВТОРОГО клиента — с другим персональным IBAN, и перевод по
    # ранее показанным реквизитам сядет не на тот счёт.
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


def _is_combo(plan: StudioBillingPlan) -> bool:
    """Тариф «фикс + процент» → подписка идёт по половинному Price.

    Режим переключается отдельным запросом (`POST /billing/model`) ДО оплаты,
    поэтому истина здесь — то, что уже лежит в БД, а не поле в теле checkout'а:
    иначе фронт мог бы попросить половинную цену на обычной подписке.
    """
    return plan.billing_mode == "combo"


def _trial_end(plan: StudioBillingPlan) -> int | None:
    """Миграция уже оплативших (спека §10): подписка стартует бесплатно до конца
    ранее оплаченного периода, и только потом начинает биллить.

    Нужно ОБЕИМ веткам: студия, оплатившая картой по старой схеме, при переходе на
    IBAN не должна платить второй раз за уже оплаченный месяц — и наоборот.
    Только для первой подписки: у существующей срок ведёт сам Stripe.
    """
    if plan.stripe_subscription_id is not None or plan.expires_at is None:
        return None
    if plan.expires_at <= datetime.utcnow():
        return None
    return int(plan.expires_at.replace(tzinfo=timezone.utc).timestamp())


def _has_live_subscription(plan: StudioBillingPlan) -> bool:
    """Подписка есть и она не мертва — тогда меняем её, а не заводим вторую."""
    return bool(plan.stripe_subscription_id) and plan.status in ("active", "past_due")


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
    """Оплата картой: страница Stripe с подпиской.

    Живой подписки нет → обычная страница оформления, тариф начинается сразу.

    Живая подписка есть — решает `body.apply`:

    * `period_end` (по умолчанию) — новый тариф ставится в расписание и начинается
      с конца текущего оплаченного периода. Платить сейчас не нужно: Stripe
      выставит счёт сам к началу новой фазы. Ничего не сгорает.
    * `now` — переход немедленный: цикл начинается заново, Stripe сразу выставляет
      полную цену нового тарифа, а остаток прежнего СГОРАЕТ. Фронт обязан
      подтвердить это отдельно — деньги теряются безвозвратно.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    _validate(body.plan, body.period_months)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    customer_id = await _ensure_customer(db, ctx, plan, require_country=False)

    combo = _is_combo(plan)
    metadata = _metadata(ctx, body.plan, body.period_months, plan.billing_mode)

    try:
        price_id = await stripe_catalog.price_id(body.plan, body.period_months, combo)
        if _has_live_subscription(plan):
            if body.apply == "period_end":
                # Метод оплаты НЕ трогаем: платить сейчас нечего, счёт новой фазы
                # придёт тем же способом, каким студия платит сегодня. Переключить
                # её на автосписание за то, что она выбрала будущий тариф, — значит
                # молча снять деньги с карты у студии, которая платит переводом.
                starts_at = await stripe_billing.schedule_price_change(
                    plan.stripe_subscription_id, price_id, metadata,
                )
                # plan_name НЕ трогаем: ступень доступа поднимет оплаченный счёт
                # новой фазы (webhook._activate). Эти поля — только подпись в
                # интерфейсе, чтобы владелец видел, что и когда его ждёт.
                plan.scheduled_plan = body.plan
                plan.scheduled_at = (
                    datetime.utcfromtimestamp(starts_at) if starts_at else None
                )
                await db.commit()
                return CheckoutResponse(
                    checkout_url=f"{WEB_APP_URL}/dashboard/billing",
                    scheduled=True,
                    applies_at=plan.scheduled_at.isoformat() if plan.scheduled_at else None,
                )

            # Немедленный переход. Ранее запланированную смену снимаем: подписку под
            # расписанием изменить нельзя, и владелец только что решил иначе.
            await stripe_billing.release_schedule(plan.stripe_subscription_id)
            # Сначала смена тарифа, потом метод оплаты: если change_subscription_price
            # упадёт, студия останется как была — а не безмолвно переключённой на
            # автосписание без применённого тарифа.
            subscription = await stripe_billing.change_subscription_price(
                plan.stripe_subscription_id, price_id, metadata,
                # Остаток прежнего периода сгорает (о чём фронт предупредил), а счёт
                # на полную цену нового тарифа выставляется сразу.
                proration_behavior="none", billing_cycle_anchor="now",
            )
            # Метод оплаты мог быть переводом — вернуть подписку на автосписание,
            # иначе студия выбрала карту, а Stripe продолжит слать счета на перевод.
            await stripe_billing.set_collection_method(
                plan.stripe_subscription_id, "charge_automatically",
            )
            plan.scheduled_plan = None
            plan.scheduled_at = None
            await db.commit()
            invoice = getattr(subscription, "latest_invoice", None)
            url = getattr(invoice, "hosted_invoice_url", None) if invoice else None
            return CheckoutResponse(checkout_url=url or f"{WEB_APP_URL}/dashboard/billing")

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
        logger.exception("Stripe billing: оплата картой не создана")
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    await db.commit()
    return CheckoutResponse(checkout_url=url)


@router.post("/checkout/iban", response_model=IbanCheckoutResponse)
# Дороже карточной ветки: помимо Customer'а создаётся подписка, финализируется
# счёт и уходит письмо с фактурой. Спам этой ручкой — спам фактурами студии.
@limiter.limit("10/minute")
async def create_iban_checkout(
    request: Request,
    body: IbanCheckoutRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Оплата банковским переводом: подписка со счётом и настоящими реквизитами.

    IBAN выдаёт Stripe (персональный и постоянный для студии), входящий перевод он
    же сверяет сам и закрывает счёт событием `invoice.paid`. Ручного перевода
    счёта в paid здесь больше нет.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    _validate(body.plan, body.period_months)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    customer_id = await _ensure_customer(db, ctx, plan, require_country=True)

    combo = _is_combo(plan)
    metadata = _metadata(ctx, body.plan, body.period_months, plan.billing_mode)

    try:
        price_id = await stripe_catalog.price_id(body.plan, body.period_months, combo)
        if _has_live_subscription(plan):
            # Ранее запланированную смену снимаем: подписку под расписанием Stripe
            # менять отказывается, а владелец только что решил платить сейчас.
            await stripe_billing.release_schedule(plan.stripe_subscription_id)
            # Сначала смена тарифа, потом метод оплаты: если change_subscription_price
            # упадёт, студия останется как была — а не безмолвно переключённой на
            # перевод без применённого тарифа и без счёта.
            await stripe_billing.change_subscription_price(
                plan.stripe_subscription_id, price_id, metadata,
                # Те же правила, что у карты: переход немедленный, остаток прежнего
                # периода сгорает, счёт выставляется на полную цену нового тарифа.
                # Разное поведение у двух способов оплаты сделало бы предупреждение
                # в интерфейсе враньём для одного из них.
                proration_behavior="none", billing_cycle_anchor="now",
            )
            plan.scheduled_plan = None
            plan.scheduled_at = None
            # Подписка могла быть на автосписании с карты — переводим её на счета,
            # иначе Stripe спишет с карты, и показанный IBAN окажется декорацией.
            await stripe_billing.set_collection_method(
                plan.stripe_subscription_id, "send_invoice",
            )
            # НЕ latest_invoice: при смене тарифа посреди периода прорация уходит в
            # отложенные позиции, а latest_invoice остаётся прошлым оплаченным счётом.
            stripe_invoice = await stripe_billing.open_or_new_invoice(
                customer_id, plan.stripe_subscription_id,
            )
            if stripe_invoice is None:
                raise HTTPException(status_code=409, detail={
                    "code": "billing.nothing_to_pay",
                    "message": "По текущей подписке доплачивать нечего",
                })
        else:
            subscription = await stripe_billing.create_iban_subscription(
                customer_id=customer_id,
                price_id=price_id,
                metadata=metadata,
                trial_end=_trial_end(plan),
            )
            plan.stripe_subscription_id = subscription.id
            # Тоже коммит сразу: ниже 409 «доплачивать нечего» (подписка с trial_end
            # счёта ещё не имеет), и на нём get_db откатит запись. Подписка при этом
            # у Stripe уже создана, а привязать её к студии вебхуку будет не по чему —
            # следующая попытка завела бы студии вторую живую подписку.
            await db.commit()
            stripe_invoice = getattr(subscription, "latest_invoice", None)
            # Первый счёт подписки может прийти черновиком: без финализации у него нет
            # ни номера (то есть назначения платежа), ни PDF, а письмо с фактурой
            # Stripe на черновик не отправит.
            if stripe_invoice is not None:
                stripe_invoice = await stripe_billing.ensure_finalized(stripe_invoice)
        iban, bic, beneficiary = await stripe_billing.funding_instructions(customer_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Stripe billing: подписка по IBAN не создана")
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    if stripe_invoice is None:
        # Подписка создана с trial_end — счёта пока нет, платить нечего до конца
        # уже оплаченного периода. Это не ошибка, но и IBAN показывать не за что.
        raise HTTPException(status_code=409, detail={
            "code": "billing.nothing_to_pay",
            "message": "Текущий период уже оплачен — счёт появится к его окончанию",
        })

    # Импорт здесь, а не сверху: webhook импортирует BACKEND_URL из этого модуля,
    # на уровне модуля вышел бы цикл.
    from .webhook import mirror_invoice

    invoice = await mirror_invoice(db, plan, stripe_invoice)
    await db.commit()

    # Фактура уезжает студии письмом сразу: реквизиты из модалки живут до её закрытия,
    # а бухгалтерии нужен документ. Сбой письма не отменяет уже выставленный счёт —
    # реквизиты для перевода лежат в ответе ниже, и оплатить можно без письма.
    try:
        await stripe_billing.email_invoice(stripe_invoice["id"])
    except Exception:
        logger.exception("Stripe billing: фактура %s не отправлена письмом", stripe_invoice["id"])

    response = IbanCheckoutResponse(
        invoice_id=invoice.id,
        invoice_number=getattr(stripe_invoice, "number", None) or f"INV-{invoice.id:06d}",
        iban=iban,
        bic=bic,
        amount=invoice.amount,
        reference=getattr(stripe_invoice, "number", None) or str(invoice.id),
        hosted_invoice_url=invoice.hosted_invoice_url,
    )
    # Получателя показываем ровно того, кого назвал Stripe: чужое имя в поле
    # получателя ломает проверку получателя в банке плательщика. Пусто — остаётся
    # дефолт схемы, чтобы поле не оказалось незаполненным.
    if beneficiary:
        response.beneficiary = beneficiary
    return response


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
    customer_id = await _ensure_customer(db, ctx, plan, require_country=False)

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
