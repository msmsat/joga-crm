"""Подписка на Velora через Stripe Subscriptions — на платформенный аккаунт.

Это НЕ Connect: деньги идут Velora, а не студии, поэтому `stripe_account` здесь
не передаётся никуда. Приём оплат клиентов студии живёт в `stripe_connect.py` и
пересекается с этим модулем только общим секретным ключом платформы.

Источник истины о подписке — Stripe. Срок, статус, повторные попытки списания и
рассылка счетов на его стороне; наша БД только зеркалит состояние из вебхука.
Своей арифметики периодов в проекте больше нет.

ПЕРВАЯ покупка идёт только картой: Checkout Session mode=subscription,
charge_automatically. Своей формы банковских реквизитов у нас нет и не будет —
именно ради этого перевод убран с первой покупки: там негде спросить адрес и номер
НДС, а Checkout спрашивает их сам.

Дальше, на УЖЕ заведённом Customer (адрес и VAT у него есть), счёт открывается
хостед-страницей Stripe, и она принимает и карту — вместе с Apple Pay и Google Pay,
— и банковский перевод: список задаёт `invoice_payment_settings()` на каждом нашем
счёте. Легаси-подписки на `send_invoice` продолжают жить: способ доставки счёта
берётся у подписки (checkout._renewal_invoice), а способы ОПЛАТЫ — уже наши.

Реквизиты плательщика (страна, индекс, адрес, VAT ID, название компании) СВОЕЙ
формой не спрашиваются и у нас не хранятся: их собирает страница Checkout
(`billing_address_collection` + `tax_id_collection`) и пишет обратно в Customer,
а ставку налога и reverse charge считает по ним Stripe Tax. Он же сверяет номер с
VIES асинхронно и присылает `customer.tax_id.updated`; фиктивный номер снимает
`delete_tax_id` из обработчика этого события.

Смена тарифа посреди периода ВСЕГДА немедленная и БЕЗ зачёта остатка
(`proration_behavior="none"` + `billing_cycle_anchor="now"`): новый период платится
целиком, неиспользованный остаток прежнего сгорает. Отложенного перехода «с
начала следующего периода» больше нет — вместе с ним ушли SubscriptionSchedule
для НОВЫХ переходов; `release_schedule` остался, потому что у студий, успевших
запланировать переход по старой схеме, расписание всё ещё висит и блокирует
`Subscription.modify`.

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


# Сколько дней у студии на оплату выставленного счёта (комиссия с офлайн-продаж,
# минимальный платёж). Меньше недели ставить нельзя: счёт должен пережить выходные.
DAYS_UNTIL_DUE = 14


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

# Чем можно оплатить НАШ счёт на хостед-странице Stripe.
#
# Задаём ЯВНО на каждом счёте, а не полагаемся на настройки подписки: у студий,
# заведённых по прежней схеме, в `payment_settings` лежит один `customer_balance`,
# и счёт наследовал его — владелец открывал страницу, где нет ничего, кроме
# банковского перевода (жалоба 13.08.2026). Явный список у счёта перекрывает
# подписку, и чинить каждую легаси-подписку руками не нужно.
#
# `card` тянет за собой Apple Pay и Google Pay: на хостед-странице Stripe рисует
# их сам, когда устройство и браузер покупателя их поддерживают. Отдельного
# способа оплаты у кошельков нет — это те же карточные платежи.
INVOICE_PAYMENT_METHODS = ["card", "customer_balance"]

# Страна банковских реквизитов для перевода. Stripe умеет выдавать их только для
# BE, DE, ES, FR, IE, NL — чешского IBAN он не отдаст, поэтому чешская студия
# видит на странице счёта НЕМЕЦКИЙ IBAN. Это нормальный SEPA-перевод и никак не
# связано ни со ставкой НДС (её Stripe Tax считает по стране плательщика), ни с
# тем, где зарегистрирована платформа.
BANK_TRANSFER_COUNTRY = os.getenv("BILLING_BANK_TRANSFER_COUNTRY", "DE")

INVOICE_PAYMENT_OPTIONS = {
    "customer_balance": {
        "funding_type": "bank_transfer",
        "bank_transfer": {
            "type": "eu_bank_transfer",
            "eu_bank_transfer": {"country": BANK_TRANSFER_COUNTRY},
        },
    },
}


def invoice_payment_settings() -> dict:
    """`payment_settings` для наших счетов: карта (с кошельками) + перевод."""
    return {
        "payment_method_types": list(INVOICE_PAYMENT_METHODS),
        "payment_method_options": INVOICE_PAYMENT_OPTIONS,
    }


async def ensure_customer(
    customer_id: str | None,
    *,
    name: str,
    email: str | None,
    studio_id: int,
    country: str | None = None,
    postal_code: str | None = None,
    city: str | None = None,
    line1: str | None = None,
    line2: str | None = None,
) -> str:
    """Stripe Customer студии — создаёт или обновляет. Идемпотентно.

    Customer заводится на СТУДИЮ, а не на пользователя: у владельца может быть
    несколько студий, а счета и подписка у них разные.

    Адрес НЕОБЯЗАТЕЛЕН и передаётся из двух разных мест:

    * оформление тарифа (routers/billing/checkout._ensure_customer) шлёт реквизиты
      с АККАУНТА плательщика — их собирает наша форма, и она источник истины;
    * счета, которые выставляем мы сами (комиссия с офлайн-продаж, минимальный
      платёж — services/offline_fee_billing), шлют адрес студии только при СОЗДАНИИ
      клиента: без местоположения Stripe Tax отвечает `customer_tax_location_invalid`.

    Налоговый номер сюда НЕ передаётся — у Customer это отдельный объект, см.
    `set_tax_id`.
    """
    address = {
        "country": country,
        "postal_code": postal_code,
        "city": city,
        "line1": line1,
        "line2": line2,
    }
    address = {k: v for k, v in address.items() if v}
    fields = dict(
        name=name,
        email=email or None,
        metadata={"studio_id": str(studio_id)},
    )
    # Пустой словарь НЕ шлём: Stripe принимает его как «стереть адрес», и клиент,
    # которому Checkout только что записал французский адрес, остался бы без него.
    if address:
        fields["address"] = address

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

    return customer_id


async def set_tax_id(customer_id: str, value: str) -> None:
    """Проставить клиенту налоговый номер, сняв все прежние. Идемпотентно.

    Прежние снимаются не для чистоты: номера у Customer живут списком, и Stripe Tax
    применяет reverse charge по ЛЮБОМУ подходящему из них. Оставленный старый номер
    продолжал бы обнулять НДС после того, как плательщик вписал в форму новый, —
    то есть правка реквизитов у нас ничего бы не меняла.

    Уже стоящий тот же номер не трогаем — иначе каждая оплата сбрасывала бы его
    статус сверки с VIES обратно в `pending`.

    Сюда доезжает только номер, УЖЕ прошедший VIES: сверка идёт в момент ввода, и
    непроверенный не сохраняется (services/vies). Собственная сверка Stripe идёт
    асинхронно и приезжает вебхуком после оплаты — на неё как на защиту полагаться
    нельзя, в test-режиме она не выполняется вовсе.

    Ошибку НЕ глушим — её ловит вызывающий (checkout._ensure_customer): номер
    необязателен, и срывать из-за него оплату нельзя.
    """
    existing = await asyncio.to_thread(stripe.Customer.list_tax_ids, customer_id, limit=100)
    if any(row.value == value for row in existing.data):
        return

    for row in existing.data:
        await asyncio.to_thread(stripe.Customer.delete_tax_id, customer_id, row.id)

    # Тип всегда `eu_vat`: номер спрашивается только у стран ЕС и только с их
    # префиксом (routers/billing/router._vat_for_country), другого сюда не доедет.
    # Карта «префикс → тип Stripe» тут была и удалена — вместе с британскими и
    # швейцарскими номерами, которые больше не принимаются: сверить их нечем.
    await asyncio.to_thread(
        stripe.Customer.create_tax_id, customer_id, type="eu_vat", value=value,
    )


async def delete_tax_id(customer_id: str, tax_id: str) -> bool:
    """Снять налоговый номер с клиента. Идемпотентно: уже снятый — не ошибка.

    Возвращает False, если номера уже не было: вызывающий (webhook._handle_tax_id)
    по этому признаку глушит повторное письмо студии на ретрае события. Своей копии
    номера у нас больше нет, и сравнить «не поменялся ли он» больше не с чем —
    единственный признак «это событие уже обработано» остался здесь.

    Номер вводит сам плательщик на странице Checkout (`tax_id_collection`), и
    reverse charge Stripe Tax применяет по ФОРМАТУ номера, не дожидаясь сверки с
    VIES — проверено вызовами `tax.Calculation` на боевом ключе, не по докам:
    `DE000000000` обнуляет налог ровно так же, как настоящий `DE811907980` (оба дали
    39.00 вместо 47.19). Сверка идёт асинхронно и приезжает вебхуком
    `customer.tax_id.updated`; в test-режиме она не выполняется вовсе — статус
    остаётся `pending` навсегда.

    Отсюда была дыра: студия, вписавшая правдоподобный мусор, платит без НДС, а
    недобор налога по несуществующему номеру — на платформе, не на студии. Сейчас
    она закрыта в ДВА слоя. Первый — своя сверка с VIES в момент ввода
    (services/vies): непроверенный номер просто не сохраняется и сюда не доезжает.
    Второй — эта функция: обработчик `customer.tax_id.updated`
    (routers/billing/webhook._handle_tax_id) снимает номер со статусом `unverified`,
    чтобы следующий счёт снова считался с налогом. Второй слой остаётся нужен и
    после первого: номер могли аннулировать уже ПОСЛЕ того, как мы его проверили.

    Ошибку НЕ глотаем: проглоченный сбой оставляет номер живым, и недобор НДС по
    нему ложится на платформу. Вызывающий отдаёт Stripe 500 и получает ретрай.
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
        return False
    return True


# Окно ключа идемпотентности Checkout Session, секунды. Публичная: по этой же
# сетке округляется trial_end (routers/billing/checkout._trial_end) — иначе тело
# запроса меняется чаще ключа, и Stripe отбивает повтор ошибкой.
IDEMPOTENCY_WINDOW = 600


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

    Реквизиты сюда ПРИХОДЯТ, а не собираются: адрес и номер НДС уже лежат в
    Customer'е — их положил туда `_ensure_customer` из нашей формы перед оплатой.
    Checkout показывает их заполненными, и платящему остаётся только карта.

    Что и почему тут стоит:

    * `automatic_tax` — ставку определяет Stripe по адресу плательщика и его
      статусу. Он же знает ставку каждой страны ЕС, применяет reverse charge и
      печатает на фактуре «Reverse charge» там, где он применён. Своей таблицы
      ставок в проекте нет и быть не должно.
    * `tax_id_collection` тут НЕТ, и это главное отличие от прежней схемы. Пока
      номер НДС спрашивал Checkout, любой мог вписать туда правдоподобный мусор и
      получить счёт без налога: Stripe Tax обнуляет НДС по ФОРМАТУ номера, а его
      сверка с VIES приезжает вебхуком уже после оплаты. Теперь номер вводится
      только у нас и только пройдя VIES (services/vies), а оставленное здесь поле
      было бы дырой в обход этой сверки — ровно той, ради закрытия которой сверка
      и делалась.
    * `billing_address_collection` НЕ ставим в `required`. По умолчанию (`auto`)
      Checkout спрашивает лишь то, чего не хватает налогу, — а у нашего Customer'а
      адрес полный, поэтому не спрашивает ничего и показывает готовое.
    * `customer_update` оставляем: при включённом `automatic_tax` и существующем
      Customer'е Stripe требует `address: "auto"` явно. Правка адреса прямо на
      странице Stripe при этом переживёт только текущую оплату — источник истины у
      адреса наш, и следующее оформление запишет в Customer нашу копию.

    `trial_end` — миграция уже оплативших: подписка не берёт денег до конца ранее
    оплаченного периода (спека §10).

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
        success_url=success_url,
        cancel_url=cancel_url,
        # 10-минутная корзина: двойной клик по «Оплатить» или ретрай после таймаута
        # не должны заводить студии вторую Checkout Session. ВАЖНО: всё, что уходит
        # в теле, обязано быть постоянным внутри окна — Stripe отвечает
        # IdempotencyError на повтор ключа с другими параметрами. Отсюда же
        # округление trial_end по этой сетке (checkout._trial_end).
        idempotency_key=f"cs:{customer_id}:{price_id}:{int(time.time() // IDEMPOTENCY_WINDOW)}",
    )
    return session.id, session.url


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

    Обязательно перед сменой тарифа: подписку, которой управляет расписание,
    `Subscription.modify` менять отказывается. Новых расписаний мы больше не
    создаём (отложенный переход убран), но у студии, успевшей запланировать
    переход по прежней схеме, оно всё ещё висит — и без этого вызова любая её
    попытка сменить тариф падала бы 502.
    """
    schedule_id = await _subscription_schedule_id(subscription_id)
    if schedule_id:
        await asyncio.to_thread(stripe.SubscriptionSchedule.release, schedule_id)


async def drop_credit_balance(customer_id: str) -> int:
    """Сжечь неиспользованный кредит на балансе клиента → сколько сожгли, центы.

    Нужно при переходе на тариф ДЕШЕВЛЕ: зачёт остатка больше новой цены, счёт
    выходит нулевым, а разницу Stripe кладёт клиенту на баланс кредитом и гасит им
    следующие счета. Правило продукта другое — остаток сгорает, и владельца об этом
    предупреждают ДО оплаты. Не сжечь его значит подарить студии месяцы, за которые
    она не платила.

    Отрицательный `balance` у Stripe = кредит, положительный = долг. Долг не
    трогаем ни при каких условиях.

    # ponytail: сжигаем ВЕСЬ кредит, не только что породила эта прорация. Других
    # источников кредита в проекте нет (возвраты уходят на карту, Refund.create),
    # но если появятся — сжигать ровно дельту превью.
    """
    customer = await asyncio.to_thread(stripe.Customer.retrieve, customer_id)
    balance = getattr(customer, "balance", 0) or 0
    if balance >= 0:
        return 0
    await asyncio.to_thread(stripe.Customer.modify, customer_id, balance=0)
    logger.info("Stripe billing: сожжён кредит %s у клиента %s", -balance, customer_id)
    return -balance


async def change_subscription_price(
    subscription_id: str, price_id: str, metadata: dict | None = None,
    *, proration_behavior: str = "none", billing_cycle_anchor: str | None = None,
):
    """Смена тарифа или периода на существующей подписке. Всегда НЕМЕДЛЕННАЯ.

    Вторую подписку не заводим: у студии она одна.

    `proration_behavior="none"` + `billing_cycle_anchor="now"` — единственный путь
    смены и тарифа (checkout._switch_now), и тарифной МОДЕЛИ (routers/billing/router.
    _reconcile_subscription): цикл начинается заново, новый период платится целиком,
    остаток прежнего СГОРАЕТ. Правило продукта, и модалка расчёта предупреждает об
    этом до нажатия «Оплатить». Якорь обязателен: без него студия получила бы тариф
    выше бесплатно до конца уже оплаченного периода.

    Зачёт остатка (`create_prorations`) здесь был и убран на MVP — см. `_switch_now`.
    Аргумент оставлен параметром: вернуть правило значит поменять одно значение.

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


def price_key_of(subscription) -> str | None:
    """`lookup_key` действующего Price у УЖЕ полученной подписки, или None.

    Отдельно от `subscription_price_key`, потому что вызывающая сторона часто
    держит подписку в руках (вебхук, сверка карты) — второй запрос к Stripe ради
    поля, которое уже лежит в объекте, стоил бы задержки на денежном пути.
    """
    items = getattr(subscription, "items", None)
    data = getattr(items, "data", None) if items is not None else None
    if not data:
        return None
    return getattr(getattr(data[0], "price", None), "lookup_key", None)


async def subscription_price_key(subscription_id: str) -> str | None:
    """`lookup_key` Price, по которому подписка идёт СЕЙЧАС, или None.

    Тариф и период подписки уже записаны в её Price (services/stripe_catalog),
    поэтому второй копии у себя мы не держим — читаем оттуда, когда надо перевести
    подписку на парный Price другого режима оплаты.
    """
    return price_key_of(
        await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
    )


async def subscription_settled(subscription_id: str) -> bool:
    """Стоит ли за ТЕКУЩИМ Price подписки оплаченный счёт.

    `change_subscription_price` переводит подписку на новый Price НЕМЕДЛЕННО, а
    счёт-прорация в этот момент ещё `open`. То есть сам по себе Price доказывает
    только то, что владелец НАЖАЛ кнопку, — не то, что тариф у студии есть.
    Пока этот счёт не оплачен, читать по Price «текущий тариф клиента» нельзя.

    Отдельным запросом, а не полем `subscription_price_key`: спрашивается он лишь
    тогда, когда Price оказался ВЫШЕ оплаченной у нас ступени, то есть в редком
    подозрительном случае. Обычная сверка тарифа лишнего похода в Stripe не платит.
    """
    subscription = await asyncio.to_thread(
        stripe.Subscription.retrieve, subscription_id, expand=["latest_invoice"],
    )
    invoice = getattr(subscription, "latest_invoice", None)
    return getattr(invoice, "status", None) == "paid"


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


# id конфигурации портала, выясненный один раз за процесс. Configuration.create НЕ
# идемпотентен, а перезапуск процесса не повод плодить конфигурации — поэтому сперва
# ищем свою по метке в metadata и только потом заводим.
_PORTAL_CONFIG_ID: str | None = None
_PORTAL_TAG = "velora_billing_portal"


async def _portal_configuration() -> str:
    """Конфигурация клиентского портала Stripe. Заводит недостающую.

    Заводим САМИ, а не полагаемся на дашборд: настройка, которой не видно в коде,
    меняется в чужом интерфейсе и молча меняет поведение продукта.

    Портал оставлен ради фактур и способа оплаты. Правки реквизитов ему НЕ отданы,
    хотя Stripe это умеет:

    * `tax_id` — это был бы обход нашей сверки с VIES в два клика. Номер НДС
      вводится только в форме реквизитов, где он проверяется по реестру ЕС; поле
      «впишите любой номер» на соседней странице обесценило бы проверку целиком.
    * `address` — источник истины у адреса наш (реквизиты лежат на аккаунте).
      Изменённый здесь адрес всё равно был бы затёрт нашей копией при следующем
      оформлении, то есть правка выглядела бы применившейся и молча пропадала.
    """
    global _PORTAL_CONFIG_ID
    if _PORTAL_CONFIG_ID:
        return _PORTAL_CONFIG_ID

    existing = await asyncio.to_thread(stripe.billing_portal.Configuration.list, limit=100)
    for config in existing.data:
        # С stripe 15 StripeObject больше НЕ наследник dict: `.get` на нём падает
        # AttributeError, и портал не открывался вовсе (502 на /billing/portal).
        # to_dict() — его штатный мост в словарь; обычный dict (тесты, ручные
        # фикстуры) проходит мимо ветки как есть.
        metadata = getattr(config, "metadata", None)
        if hasattr(metadata, "to_dict"):
            metadata = metadata.to_dict()
        if (metadata or {}).get("velora") == _PORTAL_TAG:
            _PORTAL_CONFIG_ID = config.id
            return _PORTAL_CONFIG_ID

    created = await asyncio.to_thread(
        stripe.billing_portal.Configuration.create,
        business_profile={"headline": "Velora"},
        features={
            # Только имя и почта: адрес и номер НДС правятся у нас (см. докстринг).
            "customer_update": {
                "enabled": True,
                "allowed_updates": ["name", "email"],
            },
            "invoice_history": {"enabled": True},
            "payment_method_update": {"enabled": True},
            # Отмену подписки порталу НЕ отдаём: у нас она живёт тумблером
            # автопродления (routers/billing/router.update_autopay), и второй путь
            # с другими правилами развёл бы состояние в БД и в Stripe.
        },
        metadata={"velora": _PORTAL_TAG},
    )
    _PORTAL_CONFIG_ID = created.id
    return _PORTAL_CONFIG_ID


async def create_portal_session(customer_id: str, return_url: str) -> str:
    """Ссылка на клиентский портал Stripe → фактуры, карта, история списаний.

    Реквизитов здесь больше нет: адрес и номер НДС правятся в разделе «Тариф и
    оплата» → «Способ оплаты», где номер проверяется по VIES (см.
    `_portal_configuration`). Прежде портал существовал именно ради VAT — поля для
    него не было больше нигде, — но своя форма закрыла эту нужду и заодно ту дыру,
    которой портал был: ввести здесь можно было любой номер.
    """
    session = await asyncio.to_thread(
        stripe.billing_portal.Session.create,
        customer=customer_id,
        configuration=await _portal_configuration(),
        return_url=return_url,
    )
    return session.url


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
    отвечает 400: эта пара параметров у Stripe несовместима.

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
        # Карта (а с ней Apple Pay и Google Pay) и банковский перевод — оба сразу.
        # Без явного списка счёт наследует способы у подписки, а у заведённых по
        # прежней схеме там один перевод, и страница открывалась без карты.
        payment_settings=invoice_payment_settings(),
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


async def void_invoice(stripe_invoice_id: str) -> bool:
    """Закрыть неоплаченный счёт, чтобы Stripe перестал его собирать. True — закрыт.

    Черновик УДАЛЯЕТСЯ (`delete`), финализированный — ГАСИТСЯ (`void_invoice`):
    у финализированного уже есть номер из сквозной нумерации, и удалить его нельзя,
    иначе в нумерации появится дыра, а это документ отчётности.

    Оплаченный, возвращённый и уже погашенный не трогаем вовсе — на такой запрос
    Stripe отвечает 400, и False здесь означает «этот счёт закрывать не наше дело».

    Счёт ОЧЕРЕДНОГО ЦИКЛА подписки (`billing_reason="subscription_cycle"`) — тоже
    не наше дело, и по двум причинам сразу. Его выставляет сам Stripe за уже
    идущий период и тут же пытается списать: погасить его посреди попытки значит
    уронить подписку в `past_due` на ровном месте. А если он неоплачен давно
    (карта отклонила месяц назад), то это ДОЛГ за период, которым студия уже
    пользовалась, — гасить его при покупке нового тарифа значило бы подарить
    месяц. Всё остальное (`subscription_update` — прорация за переход, `manual` —
    счёт продления) рождается нажатием кнопки и дублируется именно так.
    """
    invoice = await asyncio.to_thread(stripe.Invoice.retrieve, stripe_invoice_id)
    if getattr(invoice, "billing_reason", None) == "subscription_cycle":
        return False
    status = getattr(invoice, "status", None)
    if status == "draft":
        await asyncio.to_thread(stripe.Invoice.delete, stripe_invoice_id)
    elif status == "open":
        await asyncio.to_thread(stripe.Invoice.void_invoice, stripe_invoice_id)
    else:
        return False
    logger.info("Stripe billing: счёт %s закрыт (был %s)", stripe_invoice_id, status)
    return True


async def ensure_finalized(stripe_invoice):
    """Черновик → финализированный счёт. Уже финализированный отдаём как есть.

    У счёта в `draft` НЕТ ни номера, ни PDF, ни ссылки на оплату, а `send_invoice`
    отвечает на него 400. Выдать студии реквизиты от такого счёта значит отправить её
    делать перевод с выдуманным назначением платежа (`INV-000123` вместо номера
    Stripe) и без фактуры на почте.

    Первый счёт подписки Stripe финализирует не всегда сразу — отсюда проверка, а не
    безусловный вызов: повторная финализация открытого счёта вернула бы 400.

    Заодно единственное место, где можно поправить способы оплаты у счёта, который
    завёл САМ Stripe (прорация при смене тарифа): он наследует их у подписки, а у
    заведённых по прежней схеме там один банковский перевод. После финализации
    список уже не поменять, поэтому — здесь, пока черновик.
    """
    if getattr(stripe_invoice, "status", None) != "draft":
        return stripe_invoice
    invoice_id = stripe_invoice["id"]
    try:
        await asyncio.to_thread(
            stripe.Invoice.modify, invoice_id, payment_settings=invoice_payment_settings(),
        )
    except Exception:
        # Не повод срывать оплату: счёт останется с теми способами, что унаследовал.
        logger.exception(
            "Stripe billing: способы оплаты счёта %s не расширены", invoice_id,
        )
    return await asyncio.to_thread(stripe.Invoice.finalize_invoice, invoice_id)


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

    import types

    # Валюта тарифа обязана быть с младшими единицами: цены в plans.py — центы.
    from services.stripe_connect import _ZERO_DECIMAL
    assert CURRENCY.upper() not in _ZERO_DECIMAL, f"BILLING_CURRENCY={CURRENCY} без младших единиц"

    # Сжигание кредита: трогаем ТОЛЬКО отрицательный баланс. Положительный — это
    # долг студии, обнулить его значит простить неоплаченный счёт.
    _modified = {}
    _real_cus_retrieve, _real_cus_modify = stripe.Customer.retrieve, stripe.Customer.modify
    stripe.Customer.modify = lambda cid, **kw: (_modified.update(kw), types.SimpleNamespace(id=cid))[1]
    stripe.Customer.retrieve = lambda cid, **kw: types.SimpleNamespace(id=cid, balance=-4200)
    assert asyncio.run(drop_credit_balance("cus_x")) == 4200
    assert _modified == {"balance": 0}
    _modified.clear()
    stripe.Customer.retrieve = lambda cid, **kw: types.SimpleNamespace(id=cid, balance=1500)
    assert asyncio.run(drop_credit_balance("cus_x")) == 0
    assert _modified == {}, "положительный баланс (долг студии) обнулять нельзя"
    stripe.Customer.retrieve = lambda cid, **kw: types.SimpleNamespace(id=cid, balance=0)
    assert asyncio.run(drop_credit_balance("cus_x")) == 0
    assert _modified == {}
    stripe.Customer.retrieve, stripe.Customer.modify = _real_cus_retrieve, _real_cus_modify

    # Страница Checkout: реквизиты сюда ПРИХОДЯТ из Customer'а, а не собираются.
    # Проверяем сам набор параметров — ставку считает Stripe Tax, адрес уезжает
    # обратно в Customer, а поля VAT тут быть не должно вовсе: Stripe Tax обнуляет
    # налог по ФОРМАТУ номера, свою сверку присылает вебхуком уже после оплаты, и
    # вписанный там правдоподобный мусор давал бы счёт без НДС мимо VIES.
    # billing_address_collection="required" отнял бы у Stripe право спрашивать у
    # физлица только страну и индекс.
    _session = {}
    _real_session_create = stripe.checkout.Session.create
    stripe.checkout.Session.create = lambda **kw: (
        _session.update(kw), types.SimpleNamespace(id="cs_x", url="https://stripe/x")
    )[1]
    asyncio.run(create_subscription_checkout("cus_A", "price_1", {"studio_id": "1"}, "s", "c"))
    assert _session["automatic_tax"] == {"enabled": True}
    assert "tax_id_collection" not in _session, "VAT снова спрашивают у Stripe — дыра мимо VIES"
    assert _session["customer_update"] == {"address": "auto", "name": "auto"}
    assert "billing_address_collection" not in _session, "auto по умолчанию: улицу у физлица не спрашиваем"
    # Ключ идемпотентности: разные студии не сталкиваются, а двойной клик — да.
    _first = _session["idempotency_key"]
    _session.clear()
    asyncio.run(create_subscription_checkout("cus_A", "price_1", {}, "s", "c"))
    assert _session["idempotency_key"] == _first, "ключ зависит от metadata, а должен — от customer_id"
    assert "None" not in _first, "в ключ утекла строка 'None'"
    _session.clear()
    asyncio.run(create_subscription_checkout("cus_B", "price_1", {}, "s", "c"))
    assert _session["idempotency_key"] != _first, "две разные студии получили один ключ"
    stripe.checkout.Session.create = _real_session_create

    # Ставка НДС — только для подписи. Отрицательная или абсурдная означала бы, что
    # в .env опечатка, а владелец увидит её как «итого с НДС».
    assert 0 <= VAT_RATE_DISPLAY < 100, VAT_RATE_DISPLAY

    # Возврат берёт тот ключ, который заполнен: карта даёт payment_intent,
    # погашение с баланса (легаси-переводы) — charge. Оба принимает Refund.create.
    _pi = types.SimpleNamespace(payment_intent="pi_1", charge=None)
    _ch = types.SimpleNamespace(payment_intent=None, charge="ch_1")
    _pick = lambda p: next(
        ({k: getattr(p, k)} for k in ("payment_intent", "charge") if getattr(p, k, None)), None
    )
    assert _pick(_pi) == {"payment_intent": "pi_1"}
    assert _pick(_ch) == {"charge": "ch_1"}
    assert _pick(types.SimpleNamespace(payment_intent=None, charge=None)) is None

    # Удалённое держим удалённым. Разовые платежи мимо подписки (Task 7), своя
    # схема оплаты переводом и отложенная смена тарифа: вернуть любую «на всякий
    # случай» значит вернуть второй путь оплаты или второе поведение кнопки
    # «Оплатить».
    #
    # BANK_TRANSFER_COUNTRY в этом списке НЕ значится, хотя своя IBAN-подписка
    # ушла: перевод остался способом оплатить уже выставленный счёт на
    # хостед-странице Stripe (INVOICE_PAYMENT_METHODS → customer_balance), и
    # страну реквизитов задаёт именно он.
    import services.stripe_billing as _self
    for _gone in (
        "create_checkout", "charge_saved_card", "fetch_session",
        "create_iban_subscription", "funding_instructions", "set_collection_method",
        "schedule_price_change",
    ):
        assert not hasattr(_self, _gone), f"{_gone} должна быть удалена"

    print("stripe_billing self-check ok")
