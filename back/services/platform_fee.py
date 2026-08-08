"""Комиссия платформы с транзакций студии — тарифы «процент» и «комбо».

Direct charges сажают деньги СРАЗУ на аккаунт студии (services/stripe_connect.py),
мимо баланса платформы. Поэтому удержать свою долю можно только через
`application_fee_amount`: Stripe снимает её с платежа и переводит на аккаунт
Velora сам. Своего учёта задолженности студии и отдельных переводов не нужно.

Ставку берём из подписки студии (`StudioBillingPlan.percent_rate`), а не из
каталога напрямую: у студии может быть согласованная ставка. Каталог остаётся
фолбэком — дрейф данных (режим проставлен, ставка пустая) не должен молча
превращаться в бесплатный приём платежей.

Ни одна функция не коммитит — только чтение.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import StudioBillingPlan
from routers.billing.plans import COMBO_PERCENT_RATE, PERCENT_ONLY_RATE

# Режим тарифа → ставка каталога, %. Режимов без процента здесь нет:
# на `subscription` платформа зарабатывает подпиской и с транзакций не берёт.
_CATALOG_RATES = {"percent": PERCENT_ONLY_RATE, "combo": COMBO_PERCENT_RATE}


def fee_amount(billing_mode: str | None, percent_rate: float | None, amount_minor: int) -> int:
    """Доля платформы в младших единицах валюты платежа. 0 = удерживать нечего.

    `amount_minor` — та же сумма, что уходит в Stripe (после ×100), иначе
    комиссия посчитается от крон вместо галержей и окажется в 100 раз меньше.
    """
    catalog_rate = _CATALOG_RATES.get(billing_mode or "")
    if catalog_rate is None:
        return 0
    if amount_minor <= 0:
        return 0

    rate = percent_rate if percent_rate and percent_rate > 0 else catalog_rate
    # Комиссия не может превышать сам платёж: такой запрос Stripe отвергает
    # целиком, и клиент не сможет заплатить из-за нашей же опечатки в ставке.
    # Лучше недобрать комиссию, чем сорвать оплату студии.
    return min(round(amount_minor * rate / 100), amount_minor)


async def fee_for_studio(db: AsyncSession, studio_id: int, amount_minor: int) -> int:
    """То же по студии. Строки тарифа нет (до онбординга) → 0."""
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if plan is None:
        return 0
    return fee_amount(plan.billing_mode, plan.percent_rate, amount_minor)


if __name__ == "__main__":
    # Подписка — платформа с транзакций студии не берёт ничего.
    assert fee_amount("subscription", None, 150000) == 0
    assert fee_amount("subscription", 3.0, 150000) == 0, "режим важнее ставки"
    assert fee_amount(None, None, 150000) == 0
    assert fee_amount("", None, 150000) == 0

    # Процент: 3% с 1500.00 = 45.00.
    assert fee_amount("percent", PERCENT_ONLY_RATE, 150000) == 4500
    # Комбо: 1.5% с той же суммы — вдвое меньше, фикс берётся подпиской отдельно.
    assert fee_amount("combo", COMBO_PERCENT_RATE, 150000) == 2250

    # Ставка пустая при живом режиме — берём каталожную, а не считаем платёж бесплатным.
    assert fee_amount("percent", None, 150000) == 4500
    assert fee_amount("combo", 0, 150000) == 2250

    # Согласованная ставка перебивает каталожную.
    assert fee_amount("percent", 8.0, 150000) == 12000
    assert fee_amount("percent", 2.0, 150000) == 3000

    # Округление до целой младшей единицы: дробных центов Stripe не принимает.
    assert fee_amount("percent", 3.0, 1666) == 50   # 49.98
    assert fee_amount("combo", 1.5, 1) == 0         # 0.015 — меньше цента, не берём
    assert isinstance(fee_amount("percent", 3.0, 1666), int)

    # Комиссия никогда не больше платежа: опечатка в ставке не должна ронять оплату.
    assert fee_amount("percent", 150.0, 10000) == 10000
    assert fee_amount("percent", 100.0, 10000) == 10000

    # Пустые и отрицательные суммы не превращаются в отрицательную комиссию.
    assert fee_amount("percent", 3.0, 0) == 0
    assert fee_amount("percent", 3.0, -100) == 0

    print("platform_fee self-check ok")
