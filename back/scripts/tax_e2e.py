"""E2E-проверка ручного налога в Stripe TEST MODE. На боевом ключе не запускается.

    # положить тестовый ключ в отдельный файл (в чат его отправлять НЕ надо):
    #   back/.env.test:  STRIPE_SECRET_KEY=sk_test_...
    #                    STRIPE_PUBLISHABLE_KEY=pk_test_...
    python -m scripts.tax_e2e            # прогон всех сценариев
    python -m scripts.tax_e2e --cleanup  # убрать за собой тестовые объекты

Что доказывает и чего НЕ доказывает. Прогон показывает, что объекты Stripe
создаются БЕЗ платного механизма: `automatic_tax.enabled=false`, ручная ставка
приложена ровно один раз, Tax API не вызывается. Он НЕ доказывает, что в
production комиссия будет нулевой: test mode в Balance ничего не начисляет.
Утверждение звучит так — «объект не использует платный механизм», а не
«комиссии не будет».

Сценарии повторяют денежные пути продукта и вызывают ТЕ ЖЕ функции
(`services/stripe_billing`), а не их пересказ: иначе прогон проверял бы стенд.

Продление проверяется через Test Clock — это единственный способ увидеть счёт
очередного периода, не дожидаясь календарного месяца.
"""
import argparse
import asyncio
import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv

# .env.test имеет приоритет: он и существует ровно для того, чтобы прогон не
# подхватил боевые ключи из обычного .env.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
load_dotenv(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.test"),
    override=True,
)

import stripe  # noqa: E402

from services import stripe_env, stripe_billing, tax_policy, tax_rates  # noqa: E402
from services.tax_policy import CustomerProfile, TaxDecision  # noqa: E402

MARK = {"velora_e2e": "1"}
_results: list[dict] = []


def _guard() -> None:
    mode = stripe_env.key_mode(os.getenv("STRIPE_SECRET_KEY"))
    if mode != stripe_env.MODE_TEST:
        print(
            f"ОТКАЗ: ключ в режиме {mode!r}. E2E запускается ТОЛЬКО на тестовом ключе.\n"
            "Положите sk_test_/pk_test_ в back/.env.test и повторите."
        )
        sys.exit(2)
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


def _record(name: str, obj_id: str, expected: str, got: str, ok: bool, extra: str = "") -> None:
    _results.append({
        "сценарий": name, "объект": obj_id, "ожидалось": expected,
        "получено": got, "итог": "OK" if ok else "ПРОВАЛ", "детали": extra,
    })
    print(f"  [{'OK ' if ok else 'FAIL'}] {name}: {got}")


async def _rate_for(country: str, percent: str, source: str = "e2e") -> str:
    """Ручная ставка на тестовом аккаунте. Идемпотентно."""
    decision = TaxDecision(
        outcome=tax_policy.TAXABLE, rate_percent=__import__("decimal").Decimal(percent),
        jurisdiction=country, tax_type="vat", display_name="VAT", rate_source=source,
    )
    rate_id, _created = await tax_rates.ensure_rate(decision, dry_run=False)
    return rate_id


def _seller() -> tax_policy.SellerProfile:
    return tax_policy.SellerProfile(
        country="CZ", vat_registered=True, vat_id="CZ00000019",
        eu_b2c_scheme=tax_policy.B2C_DOMESTIC_UNDER_THRESHOLD, confirmed=True,
        non_eu_confirmed=True,
    )


async def _application(country: str | None, vat_state: str):
    decision = tax_policy.decide(
        _seller(), CustomerProfile(country=country, vat_state=vat_state),
        tax_policy.SUPPLY_SAAS_SUBSCRIPTION,
    )
    if decision.needs_review:
        return None, decision
    return await tax_rates.resolve(decision), decision


async def _customer(country: str | None, name: str) -> str:
    fields = dict(name=f"E2E {name}", email=f"e2e-{name}@example.invalid", metadata=MARK)
    if country:
        fields["address"] = {"country": country, "city": "X", "line1": "Y", "postal_code": "10000"}
    return (await asyncio.to_thread(stripe.Customer.create, **fields)).id


def _auto(obj):
    return getattr(getattr(obj, "automatic_tax", None), "enabled", None)


def _tax_lines(invoice):
    return [
        (getattr(t, "amount", None),
         getattr(getattr(t, "tax_rate_details", None), "percentage_decimal", None))
        for t in (getattr(invoice, "total_taxes", None) or [])
    ]


# --- сценарии -----------------------------------------------------------------

async def scenario_invoice(label, country, vat_state, expect_tax: int | None) -> None:
    """Один счёт: черновик → финализация → проверка налога, PDF и hosted-страницы."""
    app, decision = await _application(country, vat_state)
    if app is None:
        _record(label, "—", "requires_review", f"requires_review ({decision.basis})",
                expect_tax is None, decision.review_reason or "")
        return
    if expect_tax is None:
        _record(label, "—", "requires_review", f"решение принято: {decision.outcome}", False)
        return

    customer = await _customer(country, label.replace(" ", "-").lower())
    await asyncio.to_thread(stripe.Customer.modify, customer, tax_exempt=app.customer_tax_exempt)
    invoice = await stripe_billing.create_fee_invoice(
        customer_id=customer, amount=3900, currency="eur",
        description=f"E2E {label}", days_until_due=14,
        metadata={**MARK, "kind": "subscription"}, tax=app,
    )
    fresh = await asyncio.to_thread(stripe.Invoice.retrieve, invoice.id)
    tax_total = sum(a for a, _p in _tax_lines(fresh) if a) or 0
    ok = (
        _auto(fresh) is False
        and tax_total == expect_tax
        and bool(getattr(fresh, "invoice_pdf", None))
        and bool(getattr(fresh, "hosted_invoice_url", None))
        and bool(getattr(fresh, "number", None))
    )
    _record(
        label, fresh.id, f"automatic_tax=false, налог={expect_tax}",
        f"automatic_tax={_auto(fresh)}, налог={tax_total}, subtotal={fresh.subtotal}, "
        f"total={fresh.total}, номер={getattr(fresh,'number',None)}, "
        f"PDF={'есть' if getattr(fresh,'invoice_pdf',None) else 'нет'}, "
        f"hosted={'есть' if getattr(fresh,'hosted_invoice_url',None) else 'нет'}",
        ok, f"исход={decision.outcome}, ставки={list(app.rate_ids)}",
    )


async def scenario_reverse_then_domestic() -> None:
    """Утечка `tax_exempt`: чешский счёт ПОСЛЕ reverse-charge счёта того же клиента."""
    customer = await _customer("DE", "leak")
    rc, _ = await _application("DE", tax_policy.VAT_VERIFIED)
    await asyncio.to_thread(stripe.Customer.modify, customer, tax_exempt=rc.customer_tax_exempt)
    first = await stripe_billing.create_fee_invoice(
        customer_id=customer, amount=3900, currency="eur", description="E2E reverse",
        days_until_due=14, metadata=MARK, tax=rc,
    )
    # Тот же клиент, но теперь обычное обложение.
    dom, _ = await _application("CZ", tax_policy.VAT_ABSENT)
    await asyncio.to_thread(stripe.Customer.modify, customer, tax_exempt=dom.customer_tax_exempt)
    second = await stripe_billing.create_fee_invoice(
        customer_id=customer, amount=3900, currency="eur", description="E2E domestic",
        days_until_due=14, metadata=MARK, tax=dom,
    )
    a = sum(x for x, _ in _tax_lines(await asyncio.to_thread(stripe.Invoice.retrieve, first.id)) if x) or 0
    b = sum(x for x, _ in _tax_lines(await asyncio.to_thread(stripe.Invoice.retrieve, second.id)) if x) or 0
    _record(
        "reverse charge → внутренний счёт", f"{first.id} / {second.id}",
        "0, затем 819", f"{a}, затем {b}", a == 0 and b == 819,
        "проверка утечки customer.tax_exempt",
    )


async def scenario_subscription_renewal() -> None:
    """Полный цикл подписки через Test Clock: создание → продление → счёт цикла."""
    clock = await asyncio.to_thread(
        stripe.test_helpers.TestClock.create,
        frozen_time=int((date.today() - timedelta(days=1)).strftime("%s") if os.name != "nt"
                        else __import__("time").time()),
        name="velora-tax-e2e",
    )
    customer = await _customer("CZ", "renewal")
    await asyncio.to_thread(stripe.Customer.modify, customer, test_clock=clock.id)
    app, _ = await _application("CZ", tax_policy.VAT_ABSENT)

    price = await asyncio.to_thread(
        stripe.Price.create, currency="eur", unit_amount=3900,
        recurring={"interval": "month"}, tax_behavior="exclusive",
        product_data={"name": "E2E plan"}, metadata=MARK,
    )
    sub = await asyncio.to_thread(
        stripe.Subscription.create, customer=customer, items=[{"price": price.id}],
        collection_method="send_invoice", days_until_due=14,
        automatic_tax={"enabled": False}, default_tax_rates=list(app.rate_ids),
        metadata=MARK,
    )
    _record("подписка создана", sub.id, "automatic_tax=false + ручная ставка",
            f"automatic_tax={_auto(sub)}, rates={[getattr(r,'id',r) for r in (sub.default_tax_rates or [])]}",
            _auto(sub) is False and len(sub.default_tax_rates or []) == 1)

    # Промотать часы на месяц вперёд — Stripe выставит счёт очередного периода сам.
    import time as _time
    await asyncio.to_thread(
        stripe.test_helpers.TestClock.advance,
        clock.id, frozen_time=int(_time.time()) + 35 * 24 * 3600,
    )
    for _ in range(60):
        state = await asyncio.to_thread(stripe.test_helpers.TestClock.retrieve, clock.id)
        if state.status == "ready":
            break
        await asyncio.sleep(2)

    invoices = await asyncio.to_thread(
        stripe.Invoice.list, customer=customer, limit=10,
    )
    cycle = [i for i in invoices.data if getattr(i, "billing_reason", None) == "subscription_cycle"]
    if not cycle:
        _record("счёт автопродления", "—", "счёт цикла создан", "счёт цикла не появился", False)
        return
    inv = cycle[0]
    tax_total = sum(a for a, _p in _tax_lines(inv) if a) or 0
    _record(
        "счёт автопродления", inv.id, "automatic_tax=false, налог=819",
        f"automatic_tax={_auto(inv)}, налог={tax_total}, total={inv.total}",
        _auto(inv) is False and tax_total == 819,
        "ставка унаследована от подписки, наш код в этот момент не участвовал",
    )


async def scenario_no_tax_api() -> None:
    """Ловушка: за весь прогон ни один сценарий не позвал Tax Calculations/Transactions."""
    _record(
        "платный Tax API не вызывался", "—", "0 вызовов",
        f"{_tax_api_calls[0]} вызовов", _tax_api_calls[0] == 0,
        "перехвачены tax.Calculation.create и tax.Transaction.create_from_calculation",
    )


_tax_api_calls = [0]


def _trap_tax_api() -> None:
    def _boom(*_a, **_kw):
        _tax_api_calls[0] += 1
        raise AssertionError("E2E позвал ПЛАТНЫЙ Tax API — этого быть не должно")
    stripe.tax.Calculation.create = _boom
    stripe.tax.Transaction.create_from_calculation = _boom


async def cleanup() -> None:
    """Убрать за собой. Test mode, поэтому удаление безопасно."""
    removed = 0
    for c in (await asyncio.to_thread(stripe.Customer.list, limit=100)).auto_paging_iter():
        md = c.metadata.to_dict() if hasattr(c.metadata, "to_dict") else dict(c.metadata or {})
        if md.get("velora_e2e"):
            await asyncio.to_thread(stripe.Customer.delete, c.id)
            removed += 1
    print(f"Удалено тестовых клиентов: {removed}")


async def main(do_cleanup: bool) -> int:
    _guard()
    if do_cleanup:
        await cleanup()
        return 0

    _trap_tax_api()
    tax_rates.reset_cache()
    print(f"Аккаунт в TEST MODE, набор правил {tax_policy.RULESET_VERSION}\n")
    print("Завожу ручные ставки:")
    print(f"  CZ 21% → {await _rate_for('CZ', '21')}\n")

    print("Счета по налоговым сценариям:")
    await scenario_invoice("CZ, без VAT ID (внутренний)", "CZ", tax_policy.VAT_ABSENT, 819)
    await scenario_invoice("EU B2B с подтверждённым VAT (reverse charge)", "DE", tax_policy.VAT_VERIFIED, 0)
    await scenario_invoice("EU B2B, VAT не подтверждён реестром", "DE", tax_policy.VAT_REGISTRY_UNAVAILABLE, 819)
    await scenario_invoice("EU B2B, VAT в проверке", "DE", tax_policy.VAT_PENDING, None)
    await scenario_invoice("EU B2C без VAT ID", "DE", tax_policy.VAT_ABSENT, 819)
    await scenario_invoice("клиент без страны", None, tax_policy.VAT_ABSENT, None)
    await scenario_invoice("клиент вне ЕС", "US", tax_policy.VAT_ABSENT, 0)

    print("\nУтечка состояния клиента:")
    await scenario_reverse_then_domestic()

    print("\nПодписка и автопродление (Test Clock):")
    try:
        await scenario_subscription_renewal()
    except Exception as exc:
        _record("подписка и автопродление", "—", "цикл пройден", f"ошибка: {exc}", False)

    print("\nЛовушка платного Tax API:")
    await scenario_no_tax_api()

    print("\n" + "=" * 78)
    failed = [r for r in _results if r["итог"] != "OK"]
    for r in _results:
        print(f"{r['итог']:<6} {r['сценарий']:<45} {r['объект']}")
    print("=" * 78)
    print(f"Пройдено: {len(_results) - len(failed)}/{len(_results)}")
    print("Уборка: python -m scripts.tax_e2e --cleanup")
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cleanup", action="store_true", help="удалить созданные тестовые объекты")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.cleanup)))
