"""Касса клиента (CL-6, Блок 4): каталог → POS → calculate (цена с бэка) → pay.
Zero Trust — вся валидация доступа и расчёт цены строго на бэке, фронт только
отображает результат.
"""
from dataclasses import dataclass
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import get_db
from dependencies import get_current_user, require_role, StudioContext
from models import (
    Account, Client, ClientLoyaltyCard, ClientPayment, GiftCertificate, Operation, Service,
    StudioSubscriptionProgramConfig, SubscriptionPackage, User,
)
from routers.clients.loyalty import accrue_points, apply_deposit_change, apply_points_change, expire_points, register_purchase
from routers.clients.subscriptions import attach_subscription
from routers.finances.accounts import get_or_create_default_account
from routers.loyalty.promocodes import find_valid_promo
from schemas.checkout import (
    CheckoutCalculateRequest, CheckoutCalculateResult, CheckoutPayRequest, CheckoutPayResult, CheckoutServiceOut,
)
from services.pricing import resolve_price

router = APIRouter(prefix="/checkout")


@router.get("/services", response_model=list[CheckoutServiceOut])
async def list_checkout_services(
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Услуги Каталога для вкладки «Разовые визиты» кассы (не то же самое,
    что владельческий GET /catalog/services — тут только чтение для продажи)."""
    services = (await db.execute(
        select(Service).where(Service.studio_id == ctx.studio_id).order_by(Service.name)
    )).scalars().all()
    return [CheckoutServiceOut(id=s.id, name=s.name, price=s.price, duration_min=s.duration_min) for s in services]


@dataclass
class PriceQuote:
    base_price: int
    discount: int
    promo_valid: bool
    bonuses_available: int
    bonuses_applied: int
    deposit_available: int
    deposit_applied: int
    certificate_applied: int
    certificate: "GiftCertificate | None"
    total_price: int
    resolved: "object"  # ResolvedPrice — для commit-стороны (6.9): promo/offer to mark used


async def _quote(
    db: AsyncSession, studio_id: int, client_id: int, package: "SubscriptionPackage | ServiceAsProduct",
    product_type: str, promo_code: str | None, use_bonuses: bool,
    use_deposit: bool = False, certificate_code: str | None = None,
) -> PriceQuote:
    """Общее ядро calculate (6.7) и pay (6.9) — обе должны считать одинаково,
    иначе pay пересчитает другую сумму, чем показал calculate.

    Порядок списаний детерминированный (V5-6, 1.1): скидки → сертификат
    (номинал) → депозит → бонусы → остаток к оплате методом.
    """
    base_price = package.price if product_type == "subscription" else package.per_visit_price

    promo = None
    promo_valid = True
    if promo_code:
        try:
            promo = await find_valid_promo(studio_id, promo_code, db)
        except HTTPException:
            promo_valid = False

    resolved = await resolve_price(db, studio_id, client_id, base_price, promo)
    discount = base_price - resolved.final_price

    remaining = resolved.final_price

    certificate_applied = 0
    certificate = None
    if certificate_code:
        certificate = (await db.execute(
            select(GiftCertificate).where(
                GiftCertificate.code == certificate_code, GiftCertificate.studio_id == studio_id,
            )
        )).scalar_one_or_none()
        if certificate is None:
            raise HTTPException(status_code=404, detail={"code": "loyalty.cert_not_found", "message": "Сертификат не найден"})
        if certificate.status != "active":
            raise HTTPException(status_code=400, detail={"code": "loyalty.cert_used", "message": "Сертификат уже погашен или недействителен"})
        if certificate.expires_at and certificate.expires_at < date.today():
            # ponytail: ленивый expire при обращении, без крон-джобы
            certificate.status = "expired"
            raise HTTPException(status_code=400, detail={"code": "loyalty.cert_expired", "message": "Срок действия сертификата истёк"})
        # ponytail: сертификат гасится целиком, частичный остаток — потом
        certificate_applied = min(certificate.amount, remaining)
        remaining -= certificate_applied

    if use_bonuses:
        # Сгоревшие баллы не должны попасть в bonuses_available (V5-7, Блок 3).
        await expire_points(db, studio_id, client_id)

    card = (await db.execute(
        select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client_id)
    )).scalar_one_or_none()

    deposit_available = card.deposit_balance if card is not None else 0
    deposit_applied = 0
    if use_deposit:
        deposit_applied = min(deposit_available, remaining)
        remaining -= deposit_applied

    bonuses_available = card.points_balance if card is not None else 0
    bonuses_applied = 0
    if use_bonuses:
        bonuses_applied = min(bonuses_available, remaining)
        remaining -= bonuses_applied

    total_price = remaining

    return PriceQuote(
        base_price=base_price,
        discount=discount,
        promo_valid=promo_valid,
        bonuses_available=bonuses_available,
        bonuses_applied=bonuses_applied,
        deposit_available=deposit_available,
        deposit_applied=deposit_applied,
        certificate_applied=certificate_applied,
        certificate=certificate,
        total_price=total_price,
        resolved=resolved,
    )


@dataclass
class ServiceAsProduct:
    """Услуга Каталога в форме, ожидаемой _quote/pay (те же поля, что у
    SubscriptionPackage) — «разовое» продаётся из Каталог → Услуги, не из
    пакетов лояльности."""
    id: int
    name: str
    price: int
    per_visit_price: int
    is_active: bool = True


async def _get_client_package(
    db: AsyncSession, studio_id: int, client_id: int, product_id: int, product_type: str,
) -> tuple[Client, "SubscriptionPackage | ServiceAsProduct"]:
    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.studio_id == studio_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail={"code": "checkout.client_not_found", "message": "Клиент не найден"})

    if product_type == "single":
        service = (await db.execute(
            select(Service).where(Service.id == product_id, Service.studio_id == studio_id)
        )).scalar_one_or_none()
        if service is None:
            raise HTTPException(status_code=404, detail={"code": "checkout.service_not_found", "message": "Услуга не найдена"})
        return client, ServiceAsProduct(id=service.id, name=service.name, price=service.price, per_visit_price=service.price)

    package = (await db.execute(
        select(SubscriptionPackage).where(
            SubscriptionPackage.id == product_id,
            SubscriptionPackage.studio_id == studio_id,
        )
    )).scalar_one_or_none()
    if package is None:
        raise HTTPException(status_code=404, detail={"code": "checkout.package_not_found", "message": "Пакет не найден"})
    if not package.is_active:
        raise HTTPException(status_code=400, detail={"code": "checkout.package_inactive", "message": "Пакет снят с продажи"})

    config = (await db.execute(
        select(StudioSubscriptionProgramConfig).where(StudioSubscriptionProgramConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if config is None or not config.is_enabled:
        raise HTTPException(
            status_code=400,
            detail={"code": "checkout.subscriptions_disabled", "message": "Программа абонементов выключена"},
        )

    return client, package


@router.post("/calculate", response_model=CheckoutCalculateResult)
async def calculate(
    body: CheckoutCalculateRequest,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Итоговая цена продукта с учётом скидок/промокода/бонусов. Деньги не
    двигает, промокод/оффер не помечает использованными — это делает /pay."""
    _client, package = await _get_client_package(db, ctx.studio_id, body.client_id, body.product_id, body.product_type)

    quote = await _quote(
        db, ctx.studio_id, body.client_id, package,
        body.product_type, body.promo_code, body.use_bonuses,
        body.use_deposit, body.certificate_code,
    )

    return CheckoutCalculateResult(
        base_price=quote.base_price,
        discount=quote.discount,
        promo_valid=quote.promo_valid,
        bonuses_available=quote.bonuses_available,
        bonuses_applied=quote.bonuses_applied,
        deposit_available=quote.deposit_available,
        deposit_applied=quote.deposit_applied,
        certificate_applied=quote.certificate_applied,
        total_price=quote.total_price,
    )


@router.post("/pay", response_model=CheckoutPayResult, status_code=201)
async def pay(
    body: CheckoutPayRequest,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Подтверждение оплаты наличными. Одна транзакция: доход в Финансы,
    списание бонусов, начисление продукта, лог в События. Сбой на любом шаге
    откатывает всё — единственный db.commit() в конце.

    «Разовое» (product_type="single") не создаёт Reservation — запись на
    конкретное занятие клиент делает отдельно через Журнал/Кошелёк уже как
    оплативший; здесь только проводится доход и продаётся право визита.
    """
    client, package = await _get_client_package(db, ctx.studio_id, body.client_id, body.product_id, body.product_type)

    if body.account_id is None:
        account = await get_or_create_default_account(db, ctx.studio_id)
    else:
        account = (await db.execute(
            select(Account).where(Account.id == body.account_id, Account.studio_id == ctx.studio_id)
        )).scalar_one_or_none()
        if account is None:
            raise HTTPException(status_code=404, detail={"code": "checkout.account_not_found", "message": "Счёт не найден"})

    # Пересчёт цены на сервере заново — не доверяем присланному с фронта итогу.
    quote = await _quote(
        db, ctx.studio_id, body.client_id, package,
        body.product_type, body.promo_code, body.use_bonuses,
        body.use_deposit, body.certificate_code,
    )
    # calculate тихо игнорирует невалидный промокод (promo_valid=false, чтобы не
    # ронять предпросмотр цены), но здесь клиент явно ожидает скидку — молча
    # списать полную цену вместо неё нельзя. Ничего ещё не добавлено в сессию.
    if body.promo_code and not quote.promo_valid:
        raise HTTPException(status_code=400, detail={"code": "checkout.promo_expired", "message": "Промокод больше недействителен"})
    # Остаток после скидок/сертификата/депозита/бонусов может быть покрыт полностью —
    # тогда метод оплаты не участвует и card/иные методы не нужны (V5-6, 1.1).
    if quote.total_price > 0 and body.payment_method != "cash":
        raise HTTPException(status_code=400, detail={"code": "checkout.card_unavailable", "message": "Оплата картой пока недоступна"})
    resolved = quote.resolved

    subscription_id: int | None = None
    if body.product_type == "subscription":
        sub = await attach_subscription(
            db, ctx.studio_id, body.client_id, package, account,
            mark_paid=True, price=quote.total_price, payment_method=body.payment_method,
        )
        await db.flush()
        subscription_id = sub.id
        # attach_subscription создаёт Operation внутри себя без возврата ссылки —
        # привязываем лог к самому абонементу, не к операции.
        entity_type, entity_id = "subscription", sub.id
    else:
        # total_price == 0 — весь товар погашен депозитом/сертификатом (V5-6, 1.1):
        # они уже проведены как доход при пополнении/выпуске, повторной Operation
        # на 0 ₽ заводить не нужно (двойной учёт выручки).
        op = None
        if quote.total_price > 0:
            op = Operation(
                studio_id=ctx.studio_id,
                type="in",
                title=f"Разовое посещение «{package.name}»",
                amount=quote.total_price,
                op_date=date.today(),
                category="Услуги",
                method=body.payment_method,
                account_id=account.id,
                client_id=body.client_id,
            )
            db.add(op)
            account.balance += quote.total_price
        payment = ClientPayment(
            client_id=body.client_id,
            amount=quote.total_price,
            description=f"Разовое посещение «{package.name}»",
            status="success",
            action_type="single",
            item_key=str(package.id),
        )
        db.add(payment)
        # Баллы начисляются от реально уплаченной суммы, не от прайса —
        # attach_subscription делает это сам для subscription; для single дублируем.
        await accrue_points(db, ctx.studio_id, body.client_id, quote.total_price)
        await register_purchase(db, ctx.studio_id, body.client_id, quote.total_price)
        await db.flush()
        entity_type, entity_id = ("operation", op.id) if op is not None else ("client_payment", payment.id)

    if quote.deposit_applied > 0:
        await apply_deposit_change(
            body.client_id, ctx.studio_id, -quote.deposit_applied, "Оплата депозитом", db,
        )
    if quote.certificate_applied > 0:
        quote.certificate.status = "used"
        quote.certificate.used_at = datetime.utcnow()
    if quote.bonuses_applied > 0:
        await apply_points_change(
            body.client_id, ctx.studio_id, -quote.bonuses_applied, "Оплата бонусами", db,
        )

    if resolved.promo is not None:
        resolved.promo.used_count += 1
    if resolved.offer is not None:
        resolved.offer.is_used = True
        resolved.offer.used_at = datetime.utcnow()

    log_activity(
        db, ctx.studio_id, "payment",
        title=f"Оплата «{package.name}» — {client.name}",
        actor_name=f"{current_user.name} {current_user.last_name or ''}".strip(),
        entity_type=entity_type, entity_id=entity_id,
    )

    await db.commit()

    return CheckoutPayResult(
        total_price=quote.total_price,
        bonuses_applied=quote.bonuses_applied,
        deposit_applied=quote.deposit_applied,
        certificate_applied=quote.certificate_applied,
        subscription_id=subscription_id,
    )
