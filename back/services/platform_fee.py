"""Комиссия платформы с транзакций студии — тарифы «процент» и «комбо».

Direct charges сажают деньги СРАЗУ на аккаунт студии (services/stripe_connect.py),
мимо баланса платформы. Поэтому удержать свою долю можно только через
`application_fee_amount`: Stripe снимает её с платежа и переводит на аккаунт
Velora сам. Своего учёта задолженности студии и отдельных переводов не нужно.

Ставку берём из подписки студии (`StudioBillingPlan.percent_rate`), а не из
каталога напрямую: у студии может быть согласованная ставка. Каталог остаётся
фолбэком — дрейф данных (режим проставлен, ставка пустая) не должен молча
превращаться в бесплатный приём платежей.

Офлайн-деньги (наличные, терминал, депозит) проходят мимо платформы целиком,
поэтому её доля по ним КОПИТСЯ строками `OfflineTransactionFee` и выставляется
студии счётом раз в месяц (services/offline_fee_billing.py). Карта не
привязывается — студия платит по счёту сама; не заплатила в срок → и CRM, и
мини-приложение блокируются (`studio_suspended`).

Ни одна функция не коммитит — вызывающий владеет транзакцией.
"""
import logging
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import BillingInvoice, OfflineTransactionFee, PlatformRevenueLedger, StudioBillingPlan
from routers.billing.plans import COMBO_PERCENT_RATE, PERCENT_ONLY_RATE

logger = logging.getLogger(__name__)

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


# Оплата, которую расщепляет сам Stripe: доля платформы удержана в момент
# платежа, и второй раз начислять её счётом нельзя.
ONLINE_METHOD = "stripe"

# Метод возвратного начисления. Не совпадает ни с одним способом оплаты —
# по нему компенсирующие строки видно в разборе, и они не путаются с продажами.
REFUND_METHOD = "refund"


async def reverse_offline_fee(
    db: AsyncSession,
    studio_id: int,
    refund_amount_minor: int,
    currency: str,
    *,
    client_id: int | None = None,
) -> OfflineTransactionFee | None:
    """Снять комиссию с возвращённой офлайн-продажи. None — снимать нечего.

    Зовётся, когда владелец проводит в Финансах расход категории «Возвраты»
    (routers/finances/operations). Наличные Stripe не расщепляет, поэтому его
    события сюда ничего не приносят — про возврат из кассы знает только CRM, и
    без этого вызова студия получала счёт за продажу, которой уже нет.

    КОМПЕНСИРУЮЩЕЙ строкой с отрицательной суммой, а не правкой исходной: та
    могла уже уехать в выставленный счёт (`invoice_id` проставлен), и менять её
    значило бы переписывать выставленный документ. Минус уменьшает ближайший
    следующий счёт — ровно как компенсирующая запись в леджере доходов
    (`record_revenue`), и по той же причине: проведённое задним числом не стирают.

    Ставку берём АКТУАЛЬНУЮ (`fee_amount`), а не ту, по которой начисляли: искать
    исходную продажу не по чему — расходная операция ссылается на клиента и сумму,
    но не на конкретную продажу. Совпадает она в подавляющем большинстве случаев
    (тариф меняют редко), а расхождение — копейки в пользу той стороны, которая
    ошиблась не по своей вине.

    НЕ коммитит: зовётся внутри транзакции операции, чтобы возврат и снятие
    комиссии появлялись атомарно.
    """
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if plan is None:
        return None

    fee = fee_amount(plan.billing_mode, plan.percent_rate, refund_amount_minor)
    if fee <= 0:
        return None

    row = OfflineTransactionFee(
        studio_id=studio_id,
        client_id=client_id,
        sale_amount=-refund_amount_minor,
        fee_amount=-fee,
        currency=currency.lower(),
        percent_rate=plan.percent_rate or _CATALOG_RATES[plan.billing_mode],
        payment_method=REFUND_METHOD,
    )
    db.add(row)
    return row


async def record_offline_fee(
    db: AsyncSession,
    studio_id: int,
    sale_amount_minor: int,
    currency: str,
    *,
    client_id: int | None = None,
    payment_method: str | None = None,
) -> OfflineTransactionFee | None:
    """Начислить комиссию с офлайн-продажи. None = начислять нечего.

    НЕ коммитит: зовётся внутри транзакции продажи, чтобы комиссия и сама
    продажа появлялись атомарно. Откатилась продажа — исчезла и комиссия, иначе
    студия получила бы счёт за сделку, которой не было.
    """
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if plan is None:
        return None

    fee = fee_amount(plan.billing_mode, plan.percent_rate, sale_amount_minor)
    if fee <= 0:
        return None

    row = OfflineTransactionFee(
        studio_id=studio_id,
        client_id=client_id,
        sale_amount=sale_amount_minor,
        fee_amount=fee,
        currency=currency.lower(),
        percent_rate=plan.percent_rate or _CATALOG_RATES[plan.billing_mode],
        payment_method=payment_method,
    )
    db.add(row)
    return row


# Счета постоплаты: просроченный любой из них закрывает студию.
# offline_fee — комиссия с наличных; min_fee — минимальный месячный платёж
# процентного тарифа (месяц, в котором платформа заработала меньше минимума).
SUSPENDING_KINDS = ("offline_fee", "min_fee")


async def suspension_reason(db: AsyncSession, studio_id: int) -> str | None:
    """Вид просроченного счёта, из-за которого студия заблокирована, или None.

    Не bool: причины две, и объяснения у них разные — «оплатите комиссию с
    офлайн-продаж» и «оплатите минимальный месячный платёж». Показать не ту
    значит отправить владельца искать долг, которого у него нет.

    Блокирует только счёт, у которого ПРОШЁЛ срок: весь grace-период студия
    работает как обычно.
    """
    return (await db.execute(
        select(BillingInvoice.kind).where(
            BillingInvoice.studio_id == studio_id,
            BillingInvoice.kind.in_(SUSPENDING_KINDS),
            BillingInvoice.status.notin_(("paid", "refunded")),
            BillingInvoice.due_at.isnot(None),
            BillingInvoice.due_at < datetime.utcnow(),
        )
        # Минимальный платёж вперёд: если просрочены оба, назвать надо тот, что
        # блокирует «непонятнее» — комиссию владелец хотя бы связывает с продажами.
        .order_by(BillingInvoice.kind.desc())
        .limit(1)
    )).scalar_one_or_none()


async def studio_suspended(db: AsyncSession, studio_id: int) -> bool:
    """Заблокирована ли студия за просроченный счёт постоплаты.

    Общая точка CRM (dependencies) и мини-приложения (booking/miniapp): доступ
    должен закрываться одинаково, иначе клиенты продолжали бы записываться в
    студию, которой платформа уже отключила кабинет.
    """
    return await suspension_reason(db, studio_id) is not None


async def record_revenue(
    db: AsyncSession,
    studio_id: int,
    source: str,
    amount_minor: int,
    currency: str,
    external_id: str,
) -> None:
    """Строка в леджер доходов платформы. Идемпотентно по `external_id`.

    НЕ коммитит. `ON CONFLICT DO NOTHING` вместо «сначала SELECT, потом INSERT»:
    вебхук Stripe доставляется повторно и параллельно, и проверка существования
    отдельным запросом гонку не закрывает — закрывает уникальный индекс.

    `amount_minor` МОЖЕТ быть отрицательной: возврат и проигранный спор снимают
    ранее записанный доход компенсирующей строкой (`rev:…` в external_id), а не
    удалением исходной — проведённую запись задним числом не стирают, иначе
    отчёты за закрытый месяц начинают меняться сами по себе. Читатели леджера
    суммируют через func.sum и минус учтут сами.
    """
    if not amount_minor:
        return
    await db.execute(
        pg_insert(PlatformRevenueLedger)
        .values(
            studio_id=studio_id,
            source=source,
            amount=amount_minor,
            currency=currency.lower(),
            external_id=external_id,
        )
        .on_conflict_do_nothing(index_elements=["external_id"])
    )


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
