"""Разбор существующих объектов Stripe перед переходом на ручной налог. DRY-RUN.

    python -m scripts.migrate_tax_mode              # только читает и показывает
    python -m scripts.migrate_tax_mode --apply      # применяет (требует разрешения владельца)

Что делает. Находит на аккаунте всё, что продолжит считать налог ПЛАТНЫМ Stripe Tax
после выката кода, и для каждого объекта показывает одно и то же:

    аккаунт и режим → текущие значения → предполагаемые изменения → причина →
    финансовые последствия → обратимость → требуемое согласование

Чего НЕ делает и делать не должен:

* не отменяет подписки и не аннулирует счета. Открытый счёт — это либо долг студии,
  либо ошибка, и решает это владелец, а не скрипт;
* не определяет «тестовый» объект по имени, сумме или возрасту. Такого признака не
  существует, а ошибка стоит денег студии;
* не переписывает финализированные документы. У них есть номер из сквозной
  нумерации, и задним числом они не меняются ничем, кроме кредит-ноты;
* не трогает отменённые подписки: значение флага на мёртвом объекте ни на что не
  влияет, а лишняя правка — это лишний повод для события и лишний риск прорации.

Порядок перехода (важен, и он же — причина, по которой скрипт отдельный):

1. завести ставки: `python -m scripts.sync_tax_rates --apply`;
2. включить режим: `BILLING_TAX_MODE=manual` + `BILLING_TAX_POLICY_CONFIRMED=<версия>`;
3. выкатить код — с этого момента НОВЫЕ документы идут по ручным ставкам;
4. только теперь этот скрипт с `--apply` — он переводит УЖЕ СУЩЕСТВУЮЩИЕ подписки.

Обратный порядок (сначала подписки, потом код) оставил бы окно, в котором подписка
уже без automatic_tax, а приложение ещё не умеет ставить ручные ставки, — то есть
счёт вообще без налога. Промежуток между шагами 3 и 4 безопасен: подписка считает
налог по-старому (платно, но правильно), пока до неё не дошла очередь.

Повторный запуск после частичного выполнения безвреден: скрипт смотрит на текущее
состояние объекта, а не на журнал своих прошлых действий.
"""
import argparse
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()

import stripe  # noqa: E402

from services import stripe_env, tax_policy, tax_rates  # noqa: E402

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")


def _rate_ids(obj) -> list[str]:
    return [getattr(r, "id", r) for r in (getattr(obj, "default_tax_rates", None) or [])]


def _automatic(obj) -> bool:
    return bool(getattr(getattr(obj, "automatic_tax", None), "enabled", False))


def _card(title: str, rows: list[tuple[str, str]]) -> None:
    print(f"\n── {title}")
    for label, value in rows:
        print(f"   {label:<22} {value}")


async def scan(apply: bool) -> int:
    mode = stripe_env.key_mode(os.getenv("STRIPE_SECRET_KEY"))
    account = await asyncio.to_thread(stripe.Account.retrieve)
    print("=" * 78)
    print(f"Аккаунт: {account.id}   режим ключа: {mode}   окружение: {stripe_env.app_env()}")
    print(f"Налоговый режим приложения: {tax_policy.mode()}   набор правил: {tax_policy.RULESET_VERSION}")
    print(f"Действие: {'ПРИМЕНЕНИЕ' if apply else 'холостой прогон (ничего не меняется)'}")
    print("=" * 78)

    if apply and mode == stripe_env.MODE_LIVE:
        print(
            "\nОТКАЗ: применение к БОЕВОМУ аккаунту требует отдельного разрешения владельца.\n"
            "Запустите на тестовом ключе либо снимите этот предохранитель осознанно, "
            "получив письменное согласие."
        )
        return 2

    gaps = tax_policy.readiness()
    if gaps:
        print("\nВНИМАНИЕ: налоговая политика не подтверждена, ручной режим включать нельзя:")
        for gap in gaps:
            print(f"  • {gap}")
        print("Разбор ниже носит справочный характер.")

    planned = 0

    # --- Подписки ---------------------------------------------------------
    subscriptions = await asyncio.to_thread(stripe.Subscription.list, status="all", limit=100)
    for sub in subscriptions.auto_paging_iter():
        automatic, rates = _automatic(sub), _rate_ids(sub)
        dead = sub.status in ("canceled", "incomplete_expired")
        if not automatic and not rates:
            continue
        if dead:
            _card(f"Подписка {sub.id}", [
                ("текущее", f"status={sub.status}, automatic_tax={automatic}, ставки={rates or '—'}"),
                ("изменения", "нет"),
                ("причина", "подписка мертва: счетов больше не будет, значит и комиссии тоже"),
                ("последствия", "нет"),
                ("обратимость", "н/д"),
                ("согласование", "не требуется"),
            ])
            continue

        planned += 1
        _card(f"Подписка {sub.id}", [
            ("текущее", f"status={sub.status}, automatic_tax={automatic}, ставки={rates or '—'}, "
                        f"collection={getattr(sub, 'collection_method', '?')}"),
            ("изменения", "automatic_tax=false; default_tax_rates ← ставка по решению студии; "
                          "tax_rates позиции очищаются"),
            ("причина", "счета очередного периода Stripe собирает из состояния подписки; пока в ней "
                        "automatic_tax=true, каждое продление снова платный расчёт"),
            ("последствия", "сумма НЕ меняется, если решение даёт ту же ставку; при reverse charge "
                            "налог исчезнет из счёта — проверьте, что номер НДС студии подтверждён"),
            ("обратимость", "полная: обратная правка возвращает automatic_tax=true"),
            ("согласование", "владелец — это изменение живого биллинга"),
        ])

    # Сам перевод выполняет ТА ЖЕ функция, что работает в проде ежечасно
    # (webhook.sync_subscription_taxes): решение по студии считается по её реальным
    # реквизитам, а не собирается здесь второй раз. Второй экземпляр той же логики
    # разошёлся бы с первым — и разошёлся бы молча.
    if apply and planned:
        from database import async_session_maker
        from routers.billing.webhook import sync_subscription_taxes

        async with async_session_maker() as db:
            changed = await sync_subscription_taxes(db)
        print(f"\nПереведено подписок: {changed} (остальные — без решения, см. лог)")

    # --- Открытые счета ---------------------------------------------------
    invoices = await asyncio.to_thread(stripe.Invoice.list, limit=100)
    for inv in invoices.auto_paging_iter():
        if inv.status not in ("draft", "open"):
            continue
        _card(f"Счёт {inv.id}", [
            ("текущее", f"status={inv.status}, reason={getattr(inv, 'billing_reason', '?')}, "
                        f"итог={inv.total} {inv.currency}, automatic_tax={_automatic(inv)}"),
            ("изменения", "черновик — можно поправить налог; открытый (финализированный) — НЕЛЬЗЯ"),
            ("причина", "у финализированного счёта есть номер из сквозной нумерации; исправляется "
                        "только кредит-нотой, и это бухгалтерское решение"),
            ("последствия", "комиссия за расчёт по этому счёту УЖЕ списана — аннулирование её не вернёт"),
            ("обратимость", "аннулирование необратимо"),
            ("согласование", "владелец: это либо долг студии, либо ошибочный документ"),
        ])

    # --- Незавершённые Checkout Sessions ----------------------------------
    sessions = await asyncio.to_thread(stripe.checkout.Session.list, limit=100, status="open")
    for ses in sessions.data:
        _card(f"Checkout Session {ses.id}", [
            ("текущее", f"status={ses.status}, mode={ses.mode}, automatic_tax={_automatic(ses)}"),
            ("изменения", "нет — сессию нельзя изменить, только истечь"),
            ("причина", "открытая сессия с automatic_tax, будучи оплаченной, создаст подписку с "
                        "платным расчётом; живут они 24 часа"),
            ("последствия", "комиссия появится только если сессию оплатят"),
            ("обратимость", "н/д"),
            ("согласование", "не требуется; дождаться истечения либо предупредить студию"),
        ])

    # --- Клиенты ----------------------------------------------------------
    customers = await asyncio.to_thread(stripe.Customer.list, limit=100)
    for cus in customers.auto_paging_iter():
        address = getattr(cus, "address", None)
        country = getattr(address, "country", None)
        tax_ids = await asyncio.to_thread(stripe.Customer.list_tax_ids, cus.id, limit=10)
        states = [
            (t.type, getattr(getattr(t, "verification", None), "status", None))
            for t in tax_ids.data
        ]
        problems = []
        if not country:
            problems.append("нет страны — налоговое решение невозможно, документ не выставится")
        if any(state == "unverified" for _t, state in states):
            problems.append("номер НДС со статусом unverified — по коду он должен сниматься вебхуком")
        if not problems:
            continue
        _card(f"Клиент {cus.id}", [
            ("текущее", f"страна={country or '—'}, tax_exempt={getattr(cus, 'tax_exempt', '?')}, "
                        f"налоговые номера={states or '—'}"),
            ("изменения", "нет автоматических"),
            ("причина", "; ".join(problems)),
            ("последствия", "счета этой студии не выставятся до исправления реквизитов"),
            ("обратимость", "н/д"),
            ("согласование", "владелец: связаться со студией и дозаполнить реквизиты"),
        ])

    print("\n" + "=" * 78)
    print(f"Подписок к переводу: {planned}")
    if not apply:
        print("Ничего не изменено. Это холостой прогон.")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="применить изменения (по умолчанию — dry-run)")
    args = parser.parse_args()
    sys.exit(asyncio.run(scan(args.apply)))
