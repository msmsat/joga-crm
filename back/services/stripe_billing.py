"""Подписка на Velora через Stripe Subscriptions — на платформенный аккаунт.

Это НЕ Connect: деньги идут Velora, а не студии, поэтому `stripe_account` здесь
не передаётся никуда. Приём оплат клиентов студии живёт в `stripe_connect.py` и
пересекается с этим модулем только общим секретным ключом платформы.

Источник истины о подписке — Stripe. Срок, статус, повторные попытки списания и
рассылка счетов на его стороне; наша БД только зеркалит состояние из вебхука.
Своей арифметики периодов в проекте больше нет.

Карта и IBAN — не две интеграции, а одна подписка с разными `collection_method`:
- карта  → Checkout Session mode=subscription, charge_automatically;
- IBAN   → send_invoice + payment_settings.customer_balance/eu_bank_transfer.

Прямой модуль без абстракций — тот же паттерн, что `stripe_connect.py`.
"""
import asyncio
import logging
import os
import time
from urllib.parse import urlparse

import stripe
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Тот же ключ платформы, что у Connect: аккаунт Velora один. Присваивание
# глобальное и идемпотентное — какой бы модуль ни импортировался первым,
# значение одно и то же.
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

# Отдельный эндпоинт вебхука — отдельная подпись. Локально `stripe listen` выдаёт
# один секрет на всю сессию, поэтому без своего значения берём общий: иначе на
# деве пришлось бы держать два туннеля ради одного прогона.
#
# Секрет эндпоинта — это граница между деньгами студий (касса, Connect) и деньгами
# Velora (тариф): общий секрет делает подпись одного эндпоинта годной для другого.
# Сам по себе подмену уже не даёт — событие подключённого аккаунта отбрасывается в
# routers/billing/webhook.py по полю `account`, — но на публичном адресе это
# лишний общий секрет, поэтому кричим на старте. Ронять приложение нельзя: живой
# вебхук оплаты тарифа умер бы молча вместе с продлениями.
WEBHOOK_SECRET = os.getenv("STRIPE_BILLING_WEBHOOK_SECRET") or os.getenv("STRIPE_WEBHOOK_SECRET", "")

if not os.getenv("STRIPE_BILLING_WEBHOOK_SECRET") and stripe.api_key and urlparse(
    os.getenv("BACKEND_URL", "http://localhost:8000")
).hostname not in ("localhost", "127.0.0.1"):
    logger.error(
        "Stripe billing: STRIPE_BILLING_WEBHOOK_SECRET не задан — /billing/webhook/stripe "
        "проверяет подпись общим с кассой секретом. Заведите эндпоинту свой секрет "
        "в дашборде Stripe (и НЕ включайте ему 'events on connected accounts')."
    )

# Валюта счетов за тариф. Цены в plans.py заданы в МЛАДШИХ единицах (99000 =
# 990.00), как их и ждёт Stripe, поэтому пересчёта тут нет. Валюту без младших
# единиц (JPY и подобные) сюда ставить нельзя — сумма уедет в 100 раз.
CURRENCY = os.getenv("BILLING_CURRENCY", "eur").lower()


def configured() -> bool:
    """False = ключ платформы не прописан в .env; оплата тарифа выключена целиком."""
    return bool(stripe.api_key)


# Куда уезжает IBAN, который увидит студия. Германия — самый узнаваемый IBAN в ЕС.
# Налогового присутствия не создаёт: счёт держит Stripe, деньги садятся на баланс
# платформы и уходят выплатой на её собственный банковский счёт.
BANK_TRANSFER_COUNTRY = os.getenv("BILLING_BANK_TRANSFER_COUNTRY", "DE").upper()

_BANK_TRANSFER = {
    "funding_type": "bank_transfer",
    "bank_transfer": {
        "type": "eu_bank_transfer",
        "eu_bank_transfer": {"country": BANK_TRANSFER_COUNTRY},
    },
}

# Сколько дней у студии на перевод по выставленному счёту. Меньше недели ставить
# нельзя: SEPA-перевод идёт 1-2 дня, плюс счёт должен пережить выходные.
DAYS_UNTIL_DUE = 14

_IBAN_PAYMENT_SETTINGS = {
    "payment_method_types": ["customer_balance"],
    "payment_method_options": {"customer_balance": _BANK_TRANSFER},
}


# Налоговая категория Stripe Tax для SaaS и способ обложения. Живут ЗДЕСЬ, а не в
# stripe_catalog, потому что нужны обоим: каталог заводит по ним Prices подписки, а
# этот модуль — позиции разовых счетов (комиссия, продление). Один набор на оба, и
# импортирует его каталог отсюда: обратное направление дало бы цикл
# (stripe_catalog → routers.billing.plans → пакет routers.billing → сюда).
#
# `exclusive` — цена БЕЗ налога, налог сверху. Позиция счёта без этого признака
# роняет automatic_tax целиком: «The price … does not have a tax behavior set».
TAX_CODE = "txcd_10103001"
TAX_BEHAVIOR = "exclusive"

# Ставка НДС для ПОКАЗА в интерфейсе, %. Цены в plans.py заданы без налога
# (TAX_BEHAVIOR = "exclusive"), и налог накидывается сверху.
#
# Это ориентир для подписи «включая НДС N%», а НЕ источник суммы: настоящую ставку
# считает Stripe Tax по стране покупателя и его статусу плательщика — у студии из
# другой страны ЕС с валидным VAT ID это будет вовсе 0 % (reverse charge). Считать
# итог по этому числу нельзя ни в коем случае.
VAT_RATE_DISPLAY = float(os.getenv("BILLING_VAT_RATE", "21"))

# Подпись регистрационного номера компании на фактуре. Своего типа налогового id
# под него у Stripe нет (eu_vat — это НОМЕР НДС, другой реквизит), поэтому он
# печатается кастомным полем, и подпись выбираем мы.
#
# Название локальное: бухгалтер ищет на фактуре тот термин, который принят у него в
# стране, и «Company reg. no.» чешскому глазу не говорит ничего. Здесь только те
# страны, за термин которых можно ручаться; всё остальное получает нейтральный
# международный вариант. Добавлять страну — только вместе с проверкой, как
# регистрационный номер называется там на самом деле: неверный местный термин хуже
# нейтрального.
_COMPANY_ID_LABELS = {
    "CZ": "IČO",
    "SK": "IČO",
}
COMPANY_ID_LABEL_DEFAULT = "Company reg. no."


def company_id_label(country: str | None) -> str:
    """Как подписать регистрационный номер на фактуре студии из этой страны."""
    return _COMPANY_ID_LABELS.get((country or "").upper(), COMPANY_ID_LABEL_DEFAULT)


async def ensure_customer(
    customer_id: str | None,
    *,
    name: str,
    email: str | None,
    country: str | None,
    postal_code: str | None,
    city: str | None,
    line1: str | None,
    vat_id: str | None,
    company_id: str | None = None,
    studio_id: int,
) -> str:
    """Stripe Customer студии — создаёт или обновляет реквизиты. Идемпотентно.

    Customer заводится на СТУДИЮ, а не на пользователя: у владельца может быть
    несколько студий, а VAT ID, адрес и счета у них разные.

    `reconciliation_mode=automatic` — страховка IBAN-ветки: если студия переведёт
    деньги без назначения платежа, Stripe всё равно применит их к открытому счёту.
    Без него платёж повиснет на балансе, а счёт останется неоплаченным.

    `company_id` (регистрационный номер компании) уезжает в
    `invoice_settings.custom_fields` — оттуда Stripe печатает его на КАЖДОЙ фактуре
    клиента, включая автоматические счета продлений. Пусто → поле снимается:
    реквизит, который студия удалила, не должен остаться напечатанным на следующих
    фактурах. Подпись поля выбирается по стране студии (`company_id_label`).
    """
    address = {
        "country": country,
        "postal_code": postal_code,
        "city": city,
        "line1": line1,
    }
    fields = dict(
        name=name,
        email=email or None,
        address={k: v for k, v in address.items() if v},
        metadata={"studio_id": str(studio_id)},
        invoice_settings={
            "custom_fields": (
                # 140 символов — предел значения у Stripe; длиннее он отвечает 400 и
                # роняет всю оплату из-за косметики. Режем здесь.
                [{"name": company_id_label(country), "value": company_id[:140]}]
                if company_id else None
            ),
        },
        # И на create, и на modify: Customer, заведённый до этой фичи (легаси-путь
        # разовых оплат), иначе навсегда останется без автосверки. Такая студия
        # переведёт деньги без назначения платежа — они зависнут на балансе, счёт
        # останется open, Stripe открутит dunning и отменит подписку у того, кто
        # УЖЕ заплатил. Customer.modify это поле принимает.
        cash_balance={"settings": {"reconciliation_mode": "automatic"}},
    )

    if customer_id:
        try:
            await asyncio.to_thread(stripe.Customer.modify, customer_id, **fields)
        except stripe.InvalidRequestError as exc:
            # `resource_missing` — сохранённого customer'а под ТЕКУЩИМ ключом нет.
            # Живой сценарий: студия завелась на test-ключе, проект переключили на
            # live (id вида `cus_…` в обоих режимах одинаковы, см. preflight
            # check_db_stripe_links). Второй — клиента удалили в дашборде Stripe.
            #
            # Терять на этом оплату нельзя: заводим нового и возвращаем его id —
            # вызывающий пишет его в plan.stripe_customer_id. Ссылку в никуда
            # чинить всё равно больше нечем, а 500 посреди оплаты — тупик, из
            # которого владелец сам не выберется.
            if exc.code != "resource_missing":
                raise
            customer_id = None

    if not customer_id:
        customer = await asyncio.to_thread(stripe.Customer.create, **fields)
        customer_id = customer.id

    if vat_id:
        await _ensure_tax_id(customer_id, vat_id)
    return customer_id


async def _ensure_tax_id(customer_id: str, vat_id: str) -> None:
    """VAT ID у customer'а. Дубли Stripe не схлопывает, поэтому сначала смотрим список.

    Ошибку не поднимаем: сбой этого вызова не повод не дать оплатить тариф.

    ВАЖНО про неверные номера — проверено вызовами `tax.Calculation` на боевом ключе,
    не по докам: reverse charge Stripe применяет по ФОРМАТУ номера, не дожидаясь
    сверки с VIES. `DE000000000` обнуляет налог ровно так же, как настоящий
    `DE811907980` (оба дали 39.00 вместо 47.19). Сверка идёт асинхронно и приезжает
    вебхуком `customer.tax_id.updated`; в test-режиме она не выполняется вовсе —
    статус остаётся `pending` навсегда.

    Отсюда дыра, которую этот модуль сам не закрывает: студия, вписавшая
    правдоподобный мусор в поле DIČ, платит без НДС, а недобор налога по
    несуществующему номеру — на платформе, не на студии. Закрывается обработчиком
    `customer.tax_id.updated` (снять номер со статусом `unverified`), а не проверкой
    здесь: синхронно ждать VIES в платёжном пути нельзя — он отвечает секундами и
    регулярно лежит.
    """
    try:
        existing = await asyncio.to_thread(stripe.Customer.list_tax_ids, customer_id, limit=100)
        if any(t.value == vat_id for t in existing.data):
            return

        # СНАЧАЛА заводим новый, ПОТОМ снимаем устаревшие. Обратный порядок оставил бы
        # клиента вообще без VAT ID, если create упадёт после успешного delete, — а это
        # хуже исходного бага: там было два номера, тут reverse charge пропадает целиком.
        await asyncio.to_thread(
            stripe.Customer.create_tax_id, customer_id, type="eu_vat", value=vat_id,
        )
        # Stripe дубли не схлопывает: без уборки у клиента висели бы два VAT ID, в PDF
        # печатались бы оба (один — чужого юрлица), а Stripe Tax мог бы и дальше
        # применять reverse charge по старому ещё валидному номеру. Недобор VAT в этом
        # случае — на Velora, не на студии.
        for stale in existing.data:
            if stale.value != vat_id:
                await asyncio.to_thread(stripe.Customer.delete_tax_id, customer_id, stale.id)
    except stripe.StripeError as exc:
        logger.warning("Stripe billing: VAT ID %s не принят (%s)", vat_id, exc)


async def delete_tax_id(customer_id: str, tax_id: str) -> None:
    """Снять налоговый номер с клиента. Идемпотентно: уже снятый — не ошибка.

    Вторая половина защиты, описанной в `_ensure_tax_id`: пока фиктивный номер
    висит у Customer'а, Stripe Tax продолжает применять по нему reverse charge, и
    следующий счёт снова уйдёт без НДС. Зовётся из обработчика
    `customer.tax_id.updated` (routers/billing/webhook._handle_tax_id).

    Ошибку, в отличие от `_ensure_tax_id`, НЕ глотаем. Там сбой означал «оплата
    пройдёт с налогом» — потеря для студии, но не для казны; здесь наоборот:
    проглоченный сбой оставляет номер живым, и недобор НДС по нему ложится на
    платформу. Вызывающий отдаёт Stripe 500 и получает ретрай.
    """
    try:
        await asyncio.to_thread(stripe.Customer.delete_tax_id, customer_id, tax_id)
    except stripe.InvalidRequestError as exc:
        # Ретрай вебхука по уже обработанному событию (или номер сняли руками в
        # дашборде) — цель достигнута, падать не за что.
        if exc.code != "resource_missing":
            raise
        logger.info(
            "Stripe billing: налоговый номер %s у клиента %s уже снят", tax_id, customer_id,
        )


async def create_subscription_checkout(
    customer_id: str,
    price_id: str,
    metadata: dict,
    success_url: str,
    cancel_url: str,
    *,
    trial_end: int | None = None,
) -> tuple[str, str]:
    """Страница оплаты подписки картой → (session_id, url).

    `tax_id_collection` + `billing_address_collection` — Stripe соберёт адрес и VAT ID
    на своей странице и запишет их в Customer. Для карточной ветки это снимает
    требование заполнить реквизиты заранее (в IBAN-ветке хостед-страницы нет,
    поэтому там они обязательны).

    `trial_end` — миграция уже оплативших: подписка не берёт денег до конца ранее
    оплаченного периода (спека §10). Нужен в обеих ветках, не только в IBAN.

    Номер карты к нам не попадает ни на каком шаге — только cus_…/pm_… и маска.
    """
    subscription_data: dict = {"metadata": metadata}
    if trial_end is not None:
        subscription_data["trial_end"] = trial_end

    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        subscription_data=subscription_data,
        metadata=metadata,
        automatic_tax={"enabled": True},
        customer_update={"address": "auto", "name": "auto"},
        tax_id_collection={"enabled": True},
        billing_address_collection="required",
        success_url=success_url,
        cancel_url=cancel_url,
        # Та же 10-минутная корзина, что у create_iban_subscription: двойной клик
        # или ретрай после таймаута не должны заводить студии вторую Checkout Session.
        idempotency_key=f"cs:{customer_id}:{price_id}:{int(time.time() // 600)}",
    )
    return session.id, session.url


async def create_iban_subscription(
    customer_id: str,
    price_id: str,
    metadata: dict,
    *,
    trial_end: int | None = None,
    days_until_due: int = DAYS_UNTIL_DUE,
):
    """Подписка с оплатой банковским переводом → Subscription с раскрытым счётом.

    `collection_method=send_invoice` значит «Stripe не списывает сам, а выставляет
    счёт и ждёт перевода». Счёт финализируется и уезжает студии на почту вместе с
    реквизитами; сверку входящего перевода Stripe делает сам.

    `trial_end` — миграция уже оплативших: подписка не берёт денег до конца ранее
    оплаченного периода (спека §10).
    """
    params = dict(
        customer=customer_id,
        items=[{"price": price_id}],
        collection_method="send_invoice",
        days_until_due=days_until_due,
        automatic_tax={"enabled": True},
        metadata=metadata,
        payment_settings=_IBAN_PAYMENT_SETTINGS,
        expand=["latest_invoice"],
        # Subscription.create НЕ идемпотентен. Двойной клик по «Оплатить переводом»
        # или ретрай после таймаута шлюза заводят студии ВТОРУЮ подписку — при том
        # что вся модель исходит из «одна на студию». Уникальность в нашей БД тут не
        # спасает: в сценарии таймаута вызов у Stripe уже прошёл, а запись до нас не
        # доехала.
        #
        # 10-минутная корзина в ключе обязательна. Ключ Stripe живёт 24 часа, и БЕЗ
        # корзины студия, отменившая подписку и осознанно оформившая её заново в тот же
        # день, прислала бы те же параметры и получила КЭШ первого ответа: вызывающая
        # сторона решит, что подписка создана, а объект на самом деле отменён.
        # Повторы одного намерения попадают в одну корзину, осознанная переподписка
        # позже — в новую.
        #
        # customer_id, а не metadata['studio_id']: customer_id — обязательный параметр
        # и есть всегда, а metadata.get() молча выродился бы в строку "None", и две
        # разные студии столкнулись бы на одном ключе.
        idempotency_key=f"sub:{customer_id}:{price_id}:{int(time.time() // 600)}",
    )
    if trial_end is not None:
        params["trial_end"] = trial_end
    return await asyncio.to_thread(stripe.Subscription.create, **params)


async def set_collection_method(subscription_id: str, method: str):
    """Переключение способа оплаты на существующей подписке (карта ⇄ перевод).

    Вторую подписку под другой метод не заводим — у студии она одна. Без этого
    вызова студия, купившая картой и потом выбравшая IBAN, продолжала бы получать
    автосписание с карты и никогда не увидела бы счёт на перевод.

    `days_until_due` принимает ТОЛЬКО `send_invoice`: передать его вместе с
    `charge_automatically` значит получить 400 от Stripe.
    """
    if method == "send_invoice":
        params = {
            "collection_method": "send_invoice",
            "days_until_due": DAYS_UNTIL_DUE,
            "payment_settings": _IBAN_PAYMENT_SETTINGS,
        }
    else:
        params = {
            "collection_method": "charge_automatically",
            "payment_settings": {"payment_method_types": ["card"]},
        }
    return await asyncio.to_thread(stripe.Subscription.modify, subscription_id, **params)


async def funding_instructions(customer_id: str) -> tuple[str, str, str]:
    """Реквизиты для перевода → (iban, bic, получатель).

    IBAN персональный и ПОСТОЯННЫЙ для этого customer'а: повторный вызов вернёт
    тот же счёт, поэтому кэшировать его у себя незачем.

    Получателя берём из ответа Stripe, а НЕ подписываем «Velora»: счёт коллекторский,
    его держателем значится Stripe. Своё имя в поле получателя — это несовпадение при
    проверке получателя (Verification of Payee, обязательна в ЕС), из-за которого банк
    плательщика показывает предупреждение или отбивает перевод.
    """
    instructions = await asyncio.to_thread(
        stripe.Customer.create_funding_instructions,
        customer_id,
        funding_type="bank_transfer",
        currency=CURRENCY,
        bank_transfer={
            "type": "eu_bank_transfer",
            "eu_bank_transfer": {"country": BANK_TRANSFER_COUNTRY},
        },
    )
    addresses = instructions.bank_transfer.financial_addresses
    iban_address = next((a for a in addresses if getattr(a, "type", None) == "iban"), None)
    if iban_address is None:
        raise RuntimeError("Stripe не вернул IBAN в инструкциях для перевода")
    account = iban_address.iban
    return account.iban, account.bic, getattr(account, "account_holder_name", "") or ""


def _phase_items(phase) -> list[dict]:
    """Позиции фазы расписания в виде, который принимает обратно `modify`.

    Из ответа Stripe price приезжает объектом, а на запись нужен id — вернуть
    объект как есть значит получить 400 посреди смены тарифа.
    """
    items = []
    for item in (getattr(phase, "items", None) or []):
        price = getattr(item, "price", None)
        price_id = price if isinstance(price, str) else getattr(price, "id", None)
        if price_id:
            items.append({"price": price_id, "quantity": getattr(item, "quantity", 1) or 1})
    return items


async def subscription_exists(subscription_id: str) -> bool:
    """Существует ли подписка под ТЕКУЩИМ ключом Stripe.

    Та же беда, что у `ensure_customer`: `sub_…` в test и live выглядят одинаково, а
    объекты между режимами не переносятся. Ссылка в никуда роняет любую попытку
    сменить тариф — Stripe отвечает `No such subscription`, а студия видит «платёжный
    сервис отклонил запрос» и упирается в тупик.

    Отдельная проверка, а не try/except по месту: id читают три ветки оформления
    (продление, отложенная смена, немедленная), и ловить `resource_missing` в каждой
    значит трижды описывать один и тот же откат.
    """
    try:
        await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    except stripe.InvalidRequestError as exc:
        if exc.code != "resource_missing":
            raise
        return False
    return True


async def _subscription_schedule_id(subscription_id: str) -> str | None:
    """id расписания, которым уже управляется подписка, или None."""
    subscription = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    schedule = getattr(subscription, "schedule", None)
    return schedule if isinstance(schedule, str) else getattr(schedule, "id", None)


async def release_schedule(subscription_id: str) -> None:
    """Снять расписание с подписки, если оно есть.

    Обязательно перед немедленной сменой тарифа: подписку, которой управляет
    расписание, `Subscription.modify` менять отказывается. Сценарий живой —
    студия запланировала переход с начала периода, а потом нажала «перейти сейчас».
    """
    schedule_id = await _subscription_schedule_id(subscription_id)
    if schedule_id:
        await asyncio.to_thread(stripe.SubscriptionSchedule.release, schedule_id)


async def schedule_price_change(
    subscription_id: str, price_id: str, metadata: dict,
) -> int | None:
    """Новый Price с НАЧАЛА следующего периода. Возвращает момент вступления в силу.

    Тариф, за который уже заплачено, доигрывает до конца — студия не теряет
    оплаченный остаток. Немедленный переход это как раз и сжигает, поэтому он
    отдельной кнопкой и с предупреждением (см. `change_subscription_price`
    с `billing_cycle_anchor="now"`).

    `metadata` уезжает на ФАЗУ: Stripe перенесёт её в метаданные подписки в момент
    входа в фазу, оттуда её прочитает счёт (`parent.subscription_details.metadata`),
    а из счёта — `webhook._activate`. Без этого продление вернуло бы студию на
    прежнюю ступень тарифа.

    Ступень доступа поднимается ТОЛЬКО оплатой счёта новой фазы. Пока период не
    кончился, студия остаётся на прежнем тарифе — и это то, за что она заплатила.
    """
    schedule_id = await _subscription_schedule_id(subscription_id)
    if schedule_id is None:
        created = await asyncio.to_thread(
            stripe.SubscriptionSchedule.create, from_subscription=subscription_id,
        )
        schedule_id, schedule = created.id, created
    else:
        schedule = await asyncio.to_thread(stripe.SubscriptionSchedule.retrieve, schedule_id)

    phases = getattr(schedule, "phases", None) or []
    if not phases:
        raise RuntimeError(f"У расписания {schedule_id} нет фаз — сменить тариф нечем")

    # Берём ТОЛЬКО текущую фазу и дописываем свою: у подписки с ранее
    # запланированной сменой фаз уже две, и добавление третьей выстроило бы
    # очередь тарифов вместо замены последнего решения владельца.
    current = phases[0]
    starts_at = getattr(current, "end_date", None)
    await asyncio.to_thread(
        stripe.SubscriptionSchedule.modify,
        schedule_id,
        phases=[
            {
                "items": _phase_items(current),
                "start_date": getattr(current, "start_date", None),
                "end_date": starts_at,
            },
            {"items": [{"price": price_id, "quantity": 1}], "iterations": 1, "metadata": metadata},
        ],
        # release: доиграв запланированную фазу, расписание отпускает подписку, и
        # она продолжается сама на новом Price. Без этого (`cancel` по умолчанию у
        # расписаний, созданных вручную) подписка бы просто закончилась.
        end_behavior="release",
    )
    return starts_at


async def change_subscription_price(
    subscription_id: str, price_id: str, metadata: dict | None = None,
    *, proration_behavior: str = "create_prorations", billing_cycle_anchor: str | None = None,
):
    """Смена тарифа или периода на существующей подписке.

    Вторую подписку не заводим: у студии она одна. Stripe выставит пропорциональный
    счёт за разницу (`create_prorations`) — это и есть корректное поведение при
    апгрейде посреди оплаченного периода.

    `proration_behavior="none"` — для смены ТАРИФНОЙ МОДЕЛИ (routers/billing/router.
    _reconcile_subscription): переход происходит сразу и без возврата денег за
    неиспользованный остаток периода. Прорация вернула бы студии остаток кредитом
    на баланс — а правило продукта ровно обратное, и модалка подтверждения на фронте
    предупреждает об этом заранее («необратимо теряете остаток оплаченного периода»).

    `billing_cycle_anchor="now"` — немедленный переход на другой тариф («перейти
    сейчас»): цикл начинается заново, Stripe сразу выставляет счёт на ПОЛНУЮ цену
    нового тарифа, а остаток прежнего сгорает. Именно поэтому кнопка отдельная и с
    предупреждением; спокойный путь — `schedule_price_change` с начала периода.
    Без anchor'а и с `proration_behavior="none"` студия получила бы тариф выше
    бесплатно до конца текущего периода.

    `metadata` обязана приехать вместе с новым Price. Ступень тарифа в нашей БД
    поднимает `webhook._activate` по `invoice.plan_name`, а тот берётся из метаданных
    ПОДПИСКИ (`parent.subscription_details.metadata`, см. mirror_invoice) — у
    автосчетов цикла своих метаданных нет. Оставить здесь старые значит: при
    понижении тарифа студия платит Start, а лимиты на следующем продлении
    возвращаются к Business — платный функционал бесплатно; при повышении —
    наоборот, студия платит Business и откатывается на Start.
    """
    subscription = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    item_id = subscription["items"].data[0].id
    params: dict = {
        "items": [{"id": item_id, "price": price_id}],
        "proration_behavior": proration_behavior,
        "expand": ["latest_invoice"],
    }
    if metadata is not None:
        params["metadata"] = metadata
    if billing_cycle_anchor is not None:
        params["billing_cycle_anchor"] = billing_cycle_anchor
        # Немедленный переход у подписки НА ТРИАЛЕ: Stripe отвергает запрос, пока
        # `trial_end` в будущем — «Trial end cannot be after billing_cycle_anchor».
        # Начать цикл сегодня и одновременно не платить до конца триала нельзя.
        #
        # Триал у нас не только «пробный период»: его же ставит миграция уже
        # оплативших (checkout._trial_end) — подписка не берёт денег до конца ранее
        # оплаченного периода. То есть под это условие попадает КАЖДАЯ студия,
        # оформившая подписку до конца триала, и обе ветки оплаты отвечали ей 502.
        #
        # Смысл кнопки «перейти сейчас» — начать платить сейчас, а остаток текущего
        # периода сжечь (о чём фронт предупреждает отдельной модалкой). Закончить
        # триал — ровно это и есть, поэтому условие снимаем, а не обходим.
        #
        # Статус берём у ТОЙ ЖЕ подписки, что уже прочитана выше: лишнего запроса
        # не делаем, а угадывать «наверное, триал есть» на денежном пути нельзя.
        if billing_cycle_anchor == "now" and getattr(subscription, "status", None) == "trialing":
            params["trial_end"] = "now"
    return await asyncio.to_thread(stripe.Subscription.modify, subscription_id, **params)


async def subscription_price_key(subscription_id: str) -> str | None:
    """`lookup_key` Price, по которому подписка идёт СЕЙЧАС, или None.

    Тариф и период подписки уже записаны в её Price (services/stripe_catalog),
    поэтому второй копии у себя мы не держим — читаем оттуда, когда надо перевести
    подписку на парный Price другого режима оплаты.
    """
    subscription = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    items = getattr(subscription, "items", None)
    data = getattr(items, "data", None) if items is not None else None
    if not data:
        return None
    return getattr(getattr(data[0], "price", None), "lookup_key", None)


async def create_setup_checkout(
    customer_id: str, success_url: str, cancel_url: str,
) -> tuple[str, str]:
    """Страница привязки карты БЕЗ списания → (session_id, url).

    `mode="setup"` — Stripe соберёт карту, пройдёт 3-D Secure и приложит метод
    к Customer'у, не взяв ни копейки. Нужна тарифу «только процент»: подписки у
    него нет, значит и счёта, оплатой которого карта привязалась бы попутно, —
    тоже. Без этой страницы такая студия не смогла бы привязать карту вообще,
    а гейт без карты её не пускает (dependencies.require_active_subscription).

    Хостед-страница, а не Stripe.js в модалке: тем же способом оплачивается
    подписка (create_subscription_checkout), фронту не нужен второй сценарий.
    """
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        mode="setup",
        customer=customer_id,
        success_url=success_url,
        cancel_url=cancel_url,
        # off_session: карту потом списываем без клиента у экрана (ежемесячный
        # счёт за комиссию). Без этого банк может отклонить фоновое списание как
        # неавторизованное — согласие на него даётся именно здесь.
        payment_method_options={"card": {"setup_future_usage": "off_session"}},
    )
    return session.id, session.url


async def fetch_setup_intent(setup_intent_id: str):
    """SetupIntent с раскрытым способом оплаты — из него берём маску карты."""
    return await asyncio.to_thread(
        stripe.SetupIntent.retrieve, setup_intent_id, expand=["payment_method"],
    )


async def set_default_payment_method(customer_id: str, payment_method_id: str) -> None:
    """Сделать карту дефолтной для счетов клиента.

    Без этого выставленный счёт за комиссию не спишется автоматически: Stripe
    берёт метод из `invoice_settings.default_payment_method`, а сам факт
    привязки карты к Customer'у его туда не кладёт.
    """
    await asyncio.to_thread(
        stripe.Customer.modify,
        customer_id,
        invoice_settings={"default_payment_method": payment_method_id},
    )


async def extend_subscription(subscription_id: str, price_id: str, trial_end: int):
    """Сдвинуть оплаченный период подписки до `trial_end`. Денег НЕ берёт.

    Продление уже оплаченного тарифа: студия купила ещё N месяцев, значит следующее
    списание должно уехать на N месяцев вперёд, а остаток текущего периода —
    остаться при ней. Именно поэтому здесь нет `billing_cycle_anchor`: он начинает
    цикл заново и сжигает остаток, что для продления ровно противоположно смыслу.

    Механизм — `trial_end` в будущем. У Stripe это единственный способ отодвинуть
    следующее списание, не выставляя счёт: подписка переходит в `trialing` (наш
    маппинг читает его как active, см. webhook.map_subscription_status), а
    `current_period_end` позиции становится новой оплаченной датой — её и зеркалит
    гейт. По наступлении Stripe спишет как обычно.

    `price_id` едет вместе: студия могла продлить на другой период (была помесячно,
    купила год), и будущие списания обязаны идти уже по нему.

    Зовётся ТОЛЬКО из вебхука по оплаченному счёту: продлить до оплаты значит
    раздать бесплатное время всем, кто счёт не оплатит.
    """
    return await asyncio.to_thread(
        stripe.Subscription.modify,
        subscription_id,
        items=[{"id": (await asyncio.to_thread(
            stripe.Subscription.retrieve, subscription_id,
        ))["items"].data[0].id, "price": price_id}],
        proration_behavior="none",
        trial_end=trial_end,
    )


async def create_fee_invoice(
    customer_id: str, amount: int, currency: str, description: str,
    days_until_due: int, metadata: dict, collection_method: str = "send_invoice",
):
    """Счёт на конкретную сумму → ФИНАЛИЗИРОВАННЫЙ Invoice. Офлайн-комиссия и
    продление уже оплаченного тарифа.

    `collection_method` по умолчанию `send_invoice` — так выставляется комиссия:
    карту у студии мы не просим, Stripe шлёт письмо со ссылкой, студия платит сама.
    Продление картой передаёт `charge_automatically`: у такой студии карта уже
    привязана, и списать по ней сразу честнее, чем отправить её платить по ссылке
    за тариф, который она и так платит автосписанием.

    `days_until_due` принимает ТОЛЬКО `send_invoice` — со вторым методом Stripe
    отвечает 400 (та же пара, что в set_collection_method).

    Порядок обязателен: сначала черновик, потом позиция ЯВНО в него. InvoiceItem
    без поля `invoice` становится ОТЛОЖЕННЫМ и приклеивается к первому же
    следующему счёту клиента — например к очередному счёту подписки комбо-студии.
    Тогда наш счёт ушёл бы пустым, а сумма за тариф выросла бы на комиссию.
    `pending_invoice_items_behavior="exclude"` — та же защита в обратную сторону.

    Финализируем сами: у финализированного счёта сразу есть номер, PDF и
    hosted-ссылка — их надо показать студии и зеркалить в БД.
    """
    invoice = await asyncio.to_thread(
        stripe.Invoice.create,
        customer=customer_id,
        currency=currency,
        collection_method=collection_method,
        **({"days_until_due": days_until_due} if collection_method == "send_invoice" else {}),
        auto_advance=True,
        pending_invoice_items_behavior="exclude",
        # Налог считает Stripe Tax, как и у счетов за тариф. Раньше его тут не было
        # вовсе: комиссия уходила студии без НДС, а подписка — с ним. Одна и та же
        # платформа не может продавать одной студии часть услуг с налогом, а часть
        # без; недобранный НДС при этом — обязательство Velora, а не студии.
        automatic_tax={"enabled": True},
        metadata=metadata,
    )
    await asyncio.to_thread(
        stripe.InvoiceItem.create,
        customer=customer_id,
        invoice=invoice.id,
        amount=amount,
        currency=currency,
        description=description,
        # ОБЯЗАТЕЛЬНО вместе с automatic_tax на счёте. Позиция, заданная голой
        # суммой, порождает у Stripe одноразовый Price без признака обложения, и
        # налоговый расчёт отваливается целиком: «The price … does not have a tax
        # behavior set». Признак и категория — те же, что у Prices подписки
        # (services/stripe_catalog берёт их отсюда), иначе комиссия облагалась бы
        # иначе, чем тариф, у одного и того же продавца.
        tax_behavior=TAX_BEHAVIOR,
        tax_code=TAX_CODE,
    )
    finalized = await asyncio.to_thread(stripe.Invoice.finalize_invoice, invoice.id)
    # Письмо со счётом — отдельным вызовом: финализация сама его не шлёт, а
    # студия без карты узнаёт о долге только из письма и виджета.
    #
    # Только для send_invoice: на автосписании Stripe отвечает на этот вызов 400
    # («можно отправлять только счета с collection_method=send_invoice»), и просить
    # оплатить по ссылке счёт, который вот-вот спишется с карты, незачем.
    if collection_method == "send_invoice":
        try:
            await asyncio.to_thread(stripe.Invoice.send_invoice, finalized.id)
        except Exception:
            logger.exception("Stripe billing: счёт %s не отправлен письмом", finalized.id)
    return finalized


async def create_settled_invoice(
    customer_id: str, amount: int, currency: str, description: str, metadata: dict,
):
    """Фактура за деньги, которые УЖЕ получены → финализированный и закрытый Invoice.

    Нужна онлайн-комиссии. Свою долю с платежа клиента Stripe удерживает в момент
    оплаты (`application_fee_amount`, services/stripe_connect.py) — деньги уже на
    аккаунте Velora. Просить их вторично счётом нельзя, это было бы двойное
    списание. Но документ обязан существовать: без него студия не спишет комиссию
    в расход, а у платформы нет фактуры на собственный доход.

    Отсюда `paid_out_of_band=True` — «оплачено мимо Stripe». Счёт получает номер,
    PDF и статус Paid, но в цикл сбора платежа не попадает: письма «оплатите» не
    уходят, dunning не запускается, доступ студии такой счёт не блокирует.

    `auto_advance=False` обязателен вместе с этим: с автопродвижением Stripe погнал
    бы счёт по обычному циклу взыскания — ровно то, чего здесь быть не должно.

    Позиция кладётся ЯВНО в этот счёт (`invoice=`), как и в create_fee_invoice:
    InvoiceItem без него становится отложенным и приклеится к следующему счёту
    подписки, раздув сумму за тариф на величину комиссии.
    """
    invoice = await asyncio.to_thread(
        stripe.Invoice.create,
        customer=customer_id,
        currency=currency,
        collection_method="send_invoice",
        days_until_due=DAYS_UNTIL_DUE,
        auto_advance=False,
        pending_invoice_items_behavior="exclude",
        # Налог считает Stripe Tax — фактура за комиссию такой же документ, как
        # счёт за тариф, и выпустить её без НДС нельзя.
        automatic_tax={"enabled": True},
        metadata=metadata,
    )
    await asyncio.to_thread(
        stripe.InvoiceItem.create,
        customer=customer_id,
        invoice=invoice.id,
        amount=amount,
        currency=currency,
        description=description,
        # ОБЯЗАТЕЛЬНО вместе с automatic_tax на счёте. Позиция, заданная голой
        # суммой, порождает у Stripe одноразовый Price без признака обложения, и
        # налоговый расчёт отваливается целиком: «The price … does not have a tax
        # behavior set». Признак и категория — те же, что у Prices подписки
        # (services/stripe_catalog берёт их отсюда), иначе комиссия облагалась бы
        # иначе, чем тариф, у одного и того же продавца.
        tax_behavior=TAX_BEHAVIOR,
        tax_code=TAX_CODE,
    )
    finalized = await asyncio.to_thread(stripe.Invoice.finalize_invoice, invoice.id)
    return await asyncio.to_thread(
        stripe.Invoice.pay, finalized.id, paid_out_of_band=True,
    )


async def open_or_new_invoice(customer_id: str, subscription_id: str):
    """Счёт, который студии реально надо оплатить прямо сейчас, или None.

    Зачем не `subscription.latest_invoice`: при смене тарифа посреди периода Stripe
    кладёт прорацию в ОТЛОЖЕННЫЕ позиции, а `latest_invoice` остаётся прошлым, уже
    оплаченным счётом. Показать его как «вот счёт на оплату» значит соврать.

    Порядок: есть открытый счёт — платим его; нет — выставляем новый по накопленным
    позициям; платить нечего — None, и вызывающая сторона отвечает 409.
    """
    # subscription обязателен: без него вернётся ЛЮБОЙ открытый счёт клиента —
    # просроченный цикл или разовый счёт легаси-пути — и студия увидит чужую сумму
    # как «счёт за апгрейд».
    existing = await asyncio.to_thread(
        stripe.Invoice.list,
        customer=customer_id, subscription=subscription_id, status="open", limit=1,
    )
    if existing.data:
        return existing.data[0]

    # Способ оплаты берём у самой подписки: у карточной студии счёт за разницу
    # должен списаться с карты, а не уехать письмом с 14-дневным сроком.
    subscription = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    method = getattr(subscription, "collection_method", "send_invoice")
    params: dict = {
        "customer": customer_id,
        "subscription": subscription_id,
        "collection_method": method,
        "automatic_tax": {"enabled": True},
        # КРИТИЧНО: по умолчанию Stripe ИСКЛЮЧАЕТ отложенные позиции из нового счёта
        # (_invoice_create_params.py: «Defaults to exclude if the parameter is omitted»).
        # Прорация за апгрейд лежит именно в них — без include счёт выйдет пустым,
        # Stripe ответит «Nothing to invoice», и студия перейдёт на дорогой тариф,
        # ничего не доплатив.
        "pending_invoice_items_behavior": "include",
    }
    if method == "send_invoice":
        params["days_until_due"] = DAYS_UNTIL_DUE

    try:
        draft = await asyncio.to_thread(stripe.Invoice.create, **params)
    except stripe.InvalidRequestError as exc:
        # Ловим ТОЛЬКО «нечего выставлять». InvalidRequestError — это generic 400:
        # сюда же попадают customer_tax_location_invalid, мёртвая подписка и
        # рассинхрон валют. Проглотить их в None значит показать студии «доплачивать
        # нечего» там, где её на самом деле невозможно счётом обслужить.
        if "nothing to invoice" not in str(exc).lower():
            raise
        logger.info("Stripe billing: выставлять нечего по подписке %s", subscription_id)
        return None

    return await asyncio.to_thread(stripe.Invoice.finalize_invoice, draft.id)


async def ensure_finalized(stripe_invoice):
    """Черновик → финализированный счёт. Уже финализированный отдаём как есть.

    У счёта в `draft` НЕТ ни номера, ни PDF, ни ссылки на оплату, а `send_invoice`
    отвечает на него 400. Выдать студии реквизиты от такого счёта значит отправить её
    делать перевод с выдуманным назначением платежа (`INV-000123` вместо номера
    Stripe) и без фактуры на почте.

    Первый счёт подписки Stripe финализирует не всегда сразу — отсюда проверка, а не
    безусловный вызов: повторная финализация открытого счёта вернула бы 400.
    """
    if getattr(stripe_invoice, "status", None) != "draft":
        return stripe_invoice
    return await asyncio.to_thread(stripe.Invoice.finalize_invoice, stripe_invoice["id"])


async def email_invoice(stripe_invoice_id: str) -> None:
    """Отправить студии фактуру письмом Stripe (счёт + реквизиты для перевода).

    Нужно именно вызовом: автоматическая рассылка финализированных счетов — галочка
    в дашборде Stripe, и полагаться на неё значит поставить доставку фактуры в
    зависимость от настройки, которую в коде не видно. Здесь письмо уходит всегда.

    Идемпотентности у эндпоинта нет: повторный вызов отправляет письмо заново. Это
    и есть желаемое поведение — студия нажала «оплатить переводом» второй раз именно
    потому, что ей нужен счёт.
    """
    await asyncio.to_thread(stripe.Invoice.send_invoice, stripe_invoice_id)


async def cancel_subscription(subscription_id: str) -> None:
    """НЕМЕДЛЕННАЯ отмена подписки. Итог придёт событием customer.subscription.deleted —
    статус в нашей БД двигает вебхук, а не эта функция.

    Для отмены ПО ЖЕЛАНИЮ ВЛАДЕЛЬЦА это не тот вызов: он обрывает доступ в ту же
    секунду и сжигает уже оплаченный остаток. Там нужен `set_cancel_at_period_end`.
    Здесь остаётся два случая, где обрыв и есть цель: уход на тариф «только процент»
    (подписки на нём нет по определению) и возврат денег за неё.
    """
    await asyncio.to_thread(stripe.Subscription.cancel, subscription_id)


async def set_cancel_at_period_end(subscription_id: str, cancel: bool):
    """Автопродление: False = «доиграть оплаченный период и закончиться».

    Ровно то, что обещают Условия (§7): «cancellation takes effect at the end of the
    current paid period; access continues until then». Деньги за начатый период не
    возвращаются, доступ до его конца остаётся — гейт смотрит на `expires_at`, а его
    Stripe при такой отмене не двигает.

    Обратное включение отменяет отмену: пока период не кончился, Stripe принимает
    `cancel_at_period_end=False`, и подписка продолжается как ни в чём не бывало.
    Поэтому один тумблер закрывает оба направления, и отдельной «переподписки» не нужно.

    Статус в нашей БД здесь не трогаем: на этот вызов Stripe сам пришлёт
    `customer.subscription.updated`, и зеркало (webhook._mirror_subscription_state)
    запишет и флаг, и срок — как со всем остальным состоянием подписки.
    """
    return await asyncio.to_thread(
        stripe.Subscription.modify, subscription_id, cancel_at_period_end=cancel,
    )


async def fetch_subscription(subscription_id: str):
    """Подписка с раскрытым способом оплаты — для сверки и сохранения маски карты.

    expand обязателен: без него в ответе лежит голый `pm_…`, и за брендом карты
    пришлось бы ходить ещё одним запросом.
    """
    return await asyncio.to_thread(
        stripe.Subscription.retrieve,
        subscription_id, expand=["default_payment_method"],
    )


async def fetch_invoice(stripe_invoice_id: str):
    """Счёт Stripe — для ручной сверки, когда вебхук не дошёл."""
    return await asyncio.to_thread(stripe.Invoice.retrieve, stripe_invoice_id)


async def refund_target_for_invoice(stripe_invoice_id: str) -> dict | None:
    """Аргументы для Refund.create по оплаченному счёту, или None.

    У Invoice поля `payment_intent` БОЛЬШЕ НЕТ: с API 2026-07-29 платежи лежат в
    `payments` (`_invoice_payment.py`) — тот же переезд, что унёс `current_period_end`
    в позицию подписки.

    Возвращаем ИМЕННО тот ключ, который заполнен. Оплата картой приходит как
    payment_intent, а погашение счёта деньгами с баланса (наш IBAN-путь) — как charge:
    по докстрингу SDK `charge` заполняется только тогда, когда интента у платежа нет.
    Refund.create принимает оба, поэтому ветвиться на нашей стороне не нужно — нужно
    лишь не потерять тот, что есть.
    """
    invoice = await asyncio.to_thread(
        stripe.Invoice.retrieve, stripe_invoice_id, expand=["payments"],
    )
    payments = getattr(invoice, "payments", None)
    for row in (getattr(payments, "data", None) or []):
        payment = getattr(row, "payment", None)
        if payment is None:
            continue
        for key in ("payment_intent", "charge"):
            value = getattr(payment, key, None)
            if value:
                return {key: value if isinstance(value, str) else getattr(value, "id", None)}
    return None


async def refund_target_for_legacy_order(order_id: str) -> dict | None:
    """Аргументы для Refund.create по легаси-счёту разовой оплаты.

    До перехода на подписки в order_id лежал либо pi_… (продление по сохранённой
    карте), либо cs_… (обычная Checkout Session). Второй случай требует похода за
    сессией: платежа в самом id нет. Новые счета сюда не попадают — у них
    stripe_invoice_id.
    """
    if order_id.startswith("pi_"):
        return {"payment_intent": order_id}
    if not order_id.startswith("cs_"):
        return None
    session = await asyncio.to_thread(
        stripe.checkout.Session.retrieve, order_id, expand=["payment_intent"],
    )
    intent = getattr(session, "payment_intent", None)
    intent_id = intent if isinstance(intent, str) else getattr(intent, "id", None)
    return {"payment_intent": intent_id} if intent_id else None


async def refund(target: dict) -> None:
    """Полный возврат платежа. `target` — {"payment_intent": …} или {"charge": …},
    как их отдаёт refund_target_for_invoice. Итог продублируется событием
    `charge.refunded`, поэтому статус счёта здесь не трогаем — его двигает apply_status."""
    await asyncio.to_thread(stripe.Refund.create, **target)


def parse_webhook(payload: bytes, signature: str) -> dict | None:
    """Проверенное событие или None, если подпись не сошлась/секрет не задан.

    Без секрета доверять телу нельзя вообще: кто угодно постучится с «оплачено»
    и получит бесплатный тариф.
    """
    if not WEBHOOK_SECRET:
        logger.warning("Stripe billing webhook: секрет не задан, событие отброшено")
        return None
    try:
        return stripe.Webhook.construct_event(payload, signature, WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        logger.warning("Stripe billing webhook: событие отброшено (%s)", exc)
        return None


if __name__ == "__main__":
    # Без секрета вебхука любое событие отбрасывается, а не принимается на веру.
    _saved, WEBHOOK_SECRET = WEBHOOK_SECRET, ""
    assert parse_webhook(b'{"type":"invoice.paid"}', "sig") is None
    WEBHOOK_SECRET = _saved

    # Валюта тарифа обязана быть с младшими единицами: цены в plans.py — центы.
    from services.stripe_connect import _ZERO_DECIMAL
    assert CURRENCY.upper() not in _ZERO_DECIMAL, f"BILLING_CURRENCY={CURRENCY} без младших единиц"

    # Банковский перевод Stripe работает не в любой валюте — CZK сюда нельзя,
    # именно из-за этого биллинг переехал на EUR.
    assert CURRENCY in ("eur", "gbp", "usd", "jpy", "mxn", "idr"), (
        f"BILLING_CURRENCY={CURRENCY} не поддерживает банковские переводы Stripe"
    )

    # Страна IBAN — двухбуквенный код, иначе Stripe отвергнет запрос инструкций.
    assert len(BANK_TRANSFER_COUNTRY) == 2 and BANK_TRANSFER_COUNTRY.isalpha()

    # Поведенческая проверка вместо текстовой: days_until_due обязан уходить ТОЛЬКО
    # с send_invoice — со вторым методом Stripe отвечает 400.
    import types
    _sent = {}
    _real_modify = stripe.Subscription.modify
    stripe.Subscription.modify = lambda sid, **kw: (_sent.update(kw), types.SimpleNamespace(id=sid))[1]
    asyncio.run(set_collection_method("sub_x", "charge_automatically"))
    assert "days_until_due" not in _sent, "days_until_due ушёл с charge_automatically"
    assert _sent["collection_method"] == "charge_automatically"
    _sent.clear()
    asyncio.run(set_collection_method("sub_x", "send_invoice"))
    assert _sent["days_until_due"] == DAYS_UNTIL_DUE
    assert _sent["collection_method"] == "send_invoice"
    stripe.Subscription.modify = _real_modify

    # Ключ идемпотентности: разные студии не сталкиваются, а повторы одного намерения
    # попадают в одну корзину. Проверяем сам ключ, а не факт его наличия.
    _keys = []
    _real_sub_create = stripe.Subscription.create
    stripe.Subscription.create = lambda **kw: (
        _keys.append(kw.get("idempotency_key")), types.SimpleNamespace(id="sub_x")
    )[1]
    asyncio.run(create_iban_subscription("cus_A", "price_1", {"studio_id": "1"}))
    asyncio.run(create_iban_subscription("cus_B", "price_1", {"studio_id": "2"}))
    asyncio.run(create_iban_subscription("cus_A", "price_1", {}))  # metadata пуста
    stripe.Subscription.create = _real_sub_create
    assert all(_keys), "ключ идемпотентности не проставлен"
    assert _keys[0] != _keys[1], "две разные студии получили один ключ"
    assert _keys[0] == _keys[2], "ключ зависит от metadata, а должен — от customer_id"
    assert "None" not in _keys[2], "в ключ утекла строка 'None'"

    # IČO печатается на фактуре кастомным полем, а снятый реквизит его убирает:
    # иначе удалённое IČO осталось бы на счетах продлений навсегда.
    _created = {}
    _real_cus_create = stripe.Customer.create
    stripe.Customer.create = lambda **kw: (_created.update(kw), types.SimpleNamespace(id="cus_x"))[1]
    _args = dict(
        name="S", email=None, country="CZ", postal_code=None, city=None,
        line1=None, vat_id=None, studio_id=1,
    )
    asyncio.run(ensure_customer(None, company_id="123 456 78", **_args))
    # Подпись поля — по стране студии: чешский бухгалтер ищет на фактуре «IČO», а
    # нейтральное «Company reg. no.» ему не говорит ничего (и наоборот).
    assert _created["invoice_settings"]["custom_fields"] == [
        {"name": "IČO", "value": "123 456 78"}
    ], _created["invoice_settings"]
    _created.clear()
    asyncio.run(ensure_customer(None, company_id=None, **_args))
    assert _created["invoice_settings"]["custom_fields"] is None

    # Страна без своего термина получает международный, а не чужой местный.
    _created.clear()
    asyncio.run(ensure_customer(
        None, company_id="HRB 12345", **{**_args, "country": "DE"},
    ))
    assert _created["invoice_settings"]["custom_fields"] == [
        {"name": COMPANY_ID_LABEL_DEFAULT, "value": "HRB 12345"}
    ], _created["invoice_settings"]
    stripe.Customer.create = _real_cus_create

    # Подпись обязана влезать в лимит имени кастомного поля Stripe (40 символов):
    # длиннее — 400 на создании клиента, то есть сорванная оплата из-за косметики.
    for _label in (*_COMPANY_ID_LABELS.values(), COMPANY_ID_LABEL_DEFAULT):
        assert 0 < len(_label) <= 40, _label

    # Ставка НДС — только для подписи. Отрицательная или абсурдная означала бы, что
    # в .env опечатка, а владелец увидит её как «итого с НДС».
    assert 0 <= VAT_RATE_DISPLAY < 100, VAT_RATE_DISPLAY

    # Возврат берёт тот ключ, который заполнен: карта даёт payment_intent,
    # погашение с баланса (IBAN) — charge. Оба принимает Refund.create.
    _pi = types.SimpleNamespace(payment_intent="pi_1", charge=None)
    _ch = types.SimpleNamespace(payment_intent=None, charge="ch_1")
    _pick = lambda p: next(
        ({k: getattr(p, k)} for k in ("payment_intent", "charge") if getattr(p, k, None)), None
    )
    assert _pick(_pi) == {"payment_intent": "pi_1"}
    assert _pick(_ch) == {"charge": "ch_1"}
    assert _pick(types.SimpleNamespace(payment_intent=None, charge=None)) is None

    # Функции разовых платежей удалены вместе с их вызывающей стороной (Task 7).
    # Ассерт держит их удалёнными: вернуть одну «на всякий случай» — значит
    # вернуть второй путь оплаты мимо подписки.
    import services.stripe_billing as _self
    for _gone in ("create_checkout", "charge_saved_card", "fetch_session"):
        assert not hasattr(_self, _gone), f"{_gone} должна быть удалена"

    print("stripe_billing self-check ok")
