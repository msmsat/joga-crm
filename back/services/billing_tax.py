"""Налог для платформенного биллинга: собрать данные, принять решение, оформить.

Один вход для всех денежных путей контура A — оплата тарифа, продление, смена,
счёт за офлайн-комиссию, минимальный платёж, фактура за онлайн-комиссию. Смысл
единственного входа в том, что налоговое решение по одной и той же студии обязано
быть одинаковым, из какого бы места оно ни спрашивалось: разошедшиеся решения дают
счёт с налогом и фактуру без него за один месяц одному плательщику.

Контур B (Connect, оплаты клиентов студиям) сюда не заходит и заходить не должен:
там продавец — студия, а не платформа, и налог платформы к тем деньгам отношения не
имеет.

Источник реквизитов плательщика — тот же, что у создания Stripe Customer: профиль
владельца на аккаунте (`User.billing_*`), и лишь при пустом профиле поля студии.
Порядок повторяет `offline_fee_billing._ensure_studio_customer` намеренно — иначе
налог считался бы по одному адресу, а на фактуре печатался другой.
"""
import asyncio
import logging
from dataclasses import dataclass

import stripe
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Studio, StudioMember, User
from services import tax_policy, tax_rates
from services.tax_policy import CustomerProfile, TaxDecision
from services.tax_rates import TaxApplication, TaxReviewRequired  # noqa: F401 (реэкспорт)

logger = logging.getLogger(__name__)

# Вид счёта в нашей БД → вид поставки для налоговой матрицы. Отображение ЯВНОЕ:
# «всё это услуги, значит облагается одинаково» — предположение, а не факт, и если
# появится новый вид счёта, он обязан попасть сюда осознанно, а не унаследовать
# категорию соседа. Неизвестный вид уходит в REQUIRES_REVIEW (tax_policy.decide).
SUPPLY_BY_KIND = {
    "subscription": tax_policy.SUPPLY_SAAS_SUBSCRIPTION,
    "offline_fee": tax_policy.SUPPLY_PLATFORM_COMMISSION,
    "min_fee": tax_policy.SUPPLY_PLATFORM_COMMISSION,
    "online_fee": tax_policy.SUPPLY_PLATFORM_COMMISSION,
}


def supply_for_kind(kind: str) -> str:
    return SUPPLY_BY_KIND.get(kind, kind)


def _vat_state(user: User | None) -> str:
    """Состояние проверки номера НДС плательщика.

    Три состояния, а не два. `billing_vat_verified=False` означает не «номер плохой»,
    а «реестр ЕС молчал в момент ввода» — недействительный номер форма просто не
    сохраняет (routers/billing/router.save_billing_profile). Схлопнуть их в один
    признак значит либо обнулить налог по непроверенному номеру, либо обвинить
    честную компанию в подделке.
    """
    if user is None or not user.billing_vat_id:
        return tax_policy.VAT_ABSENT
    return tax_policy.VAT_VERIFIED if user.billing_vat_verified else tax_policy.VAT_REGISTRY_UNAVAILABLE


async def _owner(db: AsyncSession, studio_id: int) -> User | None:
    return (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(
            StudioMember.studio_id == studio_id,
            StudioMember.role == "owner",
            StudioMember.status == "active",
        )
    )).scalars().first()


async def customer_profile(db: AsyncSession, studio_id: int) -> CustomerProfile:
    """Данные плательщика для налогового решения."""
    owner = await _owner(db, studio_id)
    if owner is not None and owner.billing_country:
        return CustomerProfile(
            country=owner.billing_country,
            vat_id=owner.billing_vat_id,
            vat_state=_vat_state(owner),
        )
    studio = (await db.execute(
        select(Studio).where(Studio.id == studio_id)
    )).scalar_one_or_none()
    # У студии номера НДС для налогового пути нет: поле карточки принимает любую
    # строку и через VIES не проходит (models/studio.py). Брать его отсюда значило бы
    # обнулять налог по непроверенному номеру.
    return CustomerProfile(
        country=(studio.country if studio is not None else None),
        vat_id=None,
        vat_state=tax_policy.VAT_ABSENT,
    )


def decide_for(customer: CustomerProfile, kind: str) -> TaxDecision:
    """Решение по уже собранному профилю. Чистая функция — удобна тестам."""
    return tax_policy.decide(
        tax_policy.seller_profile(), customer, supply_for_kind(kind),
    )


async def application(db: AsyncSession, studio_id: int, kind: str) -> TaxApplication:
    """Главный вход: студия и вид счёта → параметры Stripe.

    В режиме `stripe_auto` (по умолчанию) возвращает прежнее поведение — считает
    Stripe Tax. Переключение налогового режима — сознательное действие
    администратора через `BILLING_TAX_MODE`, а не побочный эффект выката.
    """
    if not tax_policy.manual_mode():
        return tax_rates.automatic_application()
    decision = decide_for(await customer_profile(db, studio_id), kind)
    if decision.needs_review:
        logger.warning(
            "Налог: студия %s, вид %s — решение требует проверки (%s: %s)",
            studio_id, kind, decision.basis, decision.review_reason,
        )
    return await tax_rates.resolve(decision)


async def sync_customer_exempt(customer_id: str, app: TaxApplication) -> None:
    """Привести `Customer.tax_exempt` в соответствие с решением.

    Почему это состояние КЛИЕНТА, а не документа: reverse charge Stripe оформляет
    именно так, и только так на фактуре и в PDF печатается обязательная отметка
    «Reverse charge» (docs.stripe.com/tax/tax-rates). Ставку 0 % вместо этого
    приложить нельзя — получится строка налога вместо предусмотренного основания.

    Отсюда же цена решения: поле общее для ВСЕХ документов клиента, и его правка
    отражается на любом счёте, который в этот момент ещё черновик. Поэтому
    выставляем его непосредственно перед созданием документа, а сам применённый
    статус кладём в снимок операции — чтобы потом было видно, каким он был, а не
    какой стоит сейчас.

    В автоматическом режиме не трогаем ничего: там статусом распоряжается Stripe Tax.
    """
    if app.automatic:
        return
    if not customer_id:
        # Клиента ещё нет — ставить статус некому. Не ошибка: у студии, ни разу не
        # заходившей в оплату, Customer заводится позже, и решение приедет вместе
        # с ним. Падать здесь значило бы сорвать документ из-за порядка шагов.
        logger.info("Налог: статус плательщика не выставлен — у студии ещё нет Stripe Customer")
        return
    await asyncio.to_thread(
        stripe.Customer.modify, customer_id, tax_exempt=app.customer_tax_exempt,
    )


def snapshot(app: TaxApplication, net_minor: int, currency: str) -> dict:
    """Неизменяемый след операции для нашей БД.

    Пересчитывать исторический документ по сегодняшнему профилю клиента нельзя —
    поэтому в строку счёта уезжает не ссылка на профиль, а сами значения: исход,
    основание, версия правил, ставка и суммы на момент выставления.
    """
    decision = app.decision
    tax_minor, _gross = tax_policy.apply(net_minor, decision)
    return {
        "tax_outcome": decision.outcome,
        "tax_basis": decision.basis or None,
        "tax_rate_percent": float(decision.rate_percent),
        "tax_amount": tax_minor,
        "tax_currency": currency.lower()[:3],
        "tax_jurisdiction": decision.jurisdiction,
        "tax_ruleset_version": decision.ruleset_version,
        "tax_evidence": _evidence_line(app),
    }


def _evidence_line(app: TaxApplication) -> str:
    """Короткая строка «на чём основано» — для бухгалтера и разбора инцидента.

    Номер НДС сюда не пишем: он и так лежит в профиле плательщика и на фактуре
    Stripe, а дублировать его в свободном тексте значит разносить по системе то,
    что потом придётся вычищать.
    """
    decision = app.decision
    bits = [f"mode={'stripe_auto' if app.automatic else 'manual'}"]
    if decision.jurisdiction:
        bits.append(f"jurisdiction={decision.jurisdiction}")
    if decision.evidence.get("vat_state"):
        bits.append(f"vat={decision.evidence['vat_state']}")
    if app.customer_tax_exempt != tax_rates.EXEMPT_NONE:
        bits.append(f"exempt={app.customer_tax_exempt}")
    if app.rate_ids:
        bits.append(f"rates={','.join(app.rate_ids)}")
    if decision.rate_source:
        bits.append(f"source={decision.rate_source}")
    return "; ".join(bits)[:400]


@dataclass(frozen=True)
class TaxPreview:
    """Что показать в интерфейсе ДО оплаты. Ни одного платного вызова."""
    outcome: str
    rate_percent: float
    net: int
    tax: int
    gross: int
    currency: str
    basis: str
    review_reason: str | None


async def preview(db: AsyncSession, studio_id: int, kind: str, net_minor: int, currency: str) -> TaxPreview:
    """Расчёт для модалки оплаты. Тем же решением, каким потом выставится счёт.

    В Stripe за расчётом не ходим ни в каком режиме: в ручном считаем сами, в
    автоматическом честно отвечаем «ставку определит Stripe на своей странице» —
    поднимать ради превью платный расчёт нельзя.
    """
    if not tax_policy.manual_mode():
        return TaxPreview(
            outcome="stripe_auto", rate_percent=0.0, net=net_minor, tax=0,
            gross=net_minor, currency=currency.upper(),
            basis="stripe_automatic_tax", review_reason=None,
        )
    decision = decide_for(await customer_profile(db, studio_id), kind)
    tax_minor, gross = tax_policy.apply(net_minor, decision)
    return TaxPreview(
        outcome=decision.outcome,
        rate_percent=float(decision.rate_percent),
        net=net_minor,
        tax=tax_minor,
        gross=gross,
        currency=currency.upper(),
        basis=decision.basis,
        review_reason=decision.review_reason,
    )
