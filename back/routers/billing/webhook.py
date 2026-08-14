"""Вебхук Stripe по подписке на Velora — единственный источник истины о её состоянии.

Публичный, без JWT (Stripe наш токен не носит) и без гейта подписки: просроченный
тариф не повод потерять оплату, которой его и продлевают.

Порядок строгий: подпись → отбросить чужой аккаунт → найти подписку студии →
зеркалировать. Подпись не сошлась → 400 (иначе поломка секрета бесшумна);
обработка упала → 500 под ретрай Stripe; всё остальное → 200.

События теряются и мимо ретраев Stripe (эндпоинт лежал дольше трёх суток), поэтому
у зеркала есть страховка — `reconcile_subscriptions`, которую раз в час зовёт
фоновый проход в services/offline_fee_billing.py.
"""
import calendar
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import async_session_maker
from models import Studio, StudioBillingPlan, BillingInvoice, PaymentCard, StudioMember, User
from services import stripe_billing, stripe_catalog
from .plans import PLANS, PERIOD_DISCOUNTS, COMBO_FIXED, COMBO_PERCENT_RATE

logger = logging.getLogger(__name__)
router = APIRouter()

# Статус подписки у Stripe → наш, который читает пейволл.
# past_due остаётся отдельным: перевод по IBAN идёт 1-2 дня, и всё это время
# подписка именно в нём. Отрубать студию за деньги в пути нельзя, поэтому гейт
# его пускает — в отличие от unpaid/canceled.
_STATUS_MAP = {
    "active": "active",
    "trialing": "active",
    "past_due": "past_due",
    "incomplete": "pending",
    "unpaid": "expired",
    "canceled": "expired",
    "incomplete_expired": "expired",
}

_INVOICE_STATUS = {
    "invoice.paid": "paid",
    "invoice.payment_failed": "failed",
}

# Вид счёта → источник дохода платформы в леджере. Раньше сюда уходила заглушка
# «offline_fee или иначе subscription», и любой новый вид счёта молча записывался
# бы выручкой за подписку.
#
# `online_fee` не входит СОЗНАТЕЛЬНО: эти деньги уже записаны строками
# `connect_fee` в момент платежа клиента (Stripe удержал долю сам), а фактура на
# них выпускается закрытой постфактум. Вторая запись удвоила бы выручку платформы
# и завысила бы `_month_platform_revenue`, по которой считается минимальный
# месячный платёж, — студия недополучила бы счёт, который ей положен.
_REVENUE_SOURCE = {
    "subscription": "subscription",
    "offline_fee": "offline_fee",
    "min_fee": "min_fee",
}


def map_subscription_status(stripe_status: str) -> str:
    """Неизвестный статус трактуем как expired, а не как active: ошибиться в
    сторону «не пустить» безопаснее, чем раздать тариф бесплатно."""
    return _STATUS_MAP.get(stripe_status, "expired")


def _customer_id(obj) -> str | None:
    """id клиента из события. Строкой или объектом — как и подписка."""
    customer = getattr(obj, "customer", None)
    if isinstance(customer, str):
        return customer
    return getattr(customer, "id", None) if customer is not None else None


async def find_plan_by_subscription(
    db: AsyncSession, subscription_id: str | None, customer_id: str | None = None,
) -> StudioBillingPlan | None:
    """Подписка студии по её id у Stripe, с привязкой по клиенту при первой встрече.

    Основной ключ — stripe_subscription_id: он уникален и однозначен.

    Но у КАРТОЧНОЙ первой оплаты его взяться неоткуда: Checkout Session отдаёт
    только ссылку, сама подписка появляется у Stripe уже после того, как владелец
    заплатил. Поэтому здесь есть второй заход — по stripe_customer_id, который мы
    сохраняем ДО похода в Stripe. Найдя студию по клиенту, тут же записываем ей
    subscription_id: дальше работает быстрый путь.

    Без этого запасного пути карточные оплаты не привязывались бы никогда, а каждый
    следующий клик по «Оплатить» заводил бы студии ещё одну живую подписку.
    """
    if subscription_id:
        plan = (await db.execute(
            select(StudioBillingPlan).where(
                StudioBillingPlan.stripe_subscription_id == subscription_id
            )
        )).scalar_one_or_none()
        if plan is not None:
            return plan

    if not customer_id:
        return None

    plan = (await db.execute(
        select(StudioBillingPlan).where(
            StudioBillingPlan.stripe_customer_id == customer_id
        )
    )).scalar_one_or_none()
    # Перепривязываем не только пустую ссылку, но и НЕ ЖИВУЮ: студия с брошенной
    # incomplete-подпиской, оформившая оплату заново, получает у Stripe новый
    # объект. Оставить указатель на старый значит отправлять следующую смену тарифа
    # в мёртвую подписку (502) при том, что статус зеркалится уже с новой.
    # Живую (active/past_due) НЕ трогаем — иначе отставшее событие об отменённой
    # подписке перебило бы актуальную привязку.
    stale = plan is not None and plan.status not in ("active", "past_due")
    if plan is not None and subscription_id and (not plan.stripe_subscription_id or stale):
        plan.stripe_subscription_id = subscription_id
        logger.info(
            "Stripe billing: подписка %s привязана к студии %s по клиенту %s",
            subscription_id, plan.studio_id, customer_id,
        )
    return plan


def _subscription_id(obj) -> str | None:
    """id подписки из счёта. В разных версиях API поле лежит то строкой в
    `subscription`, то объектом, то в `parent.subscription_details`."""
    sub = getattr(obj, "subscription", None)
    if isinstance(sub, str):
        return sub
    if sub is not None:
        return getattr(sub, "id", None)
    parent = getattr(obj, "parent", None)
    details = getattr(parent, "subscription_details", None) if parent else None
    detail_sub = getattr(details, "subscription", None) if details else None
    return detail_sub if isinstance(detail_sub, str) else getattr(detail_sub, "id", None)


def _period_end(subscription) -> int | None:
    """Конец оплаченного периода. У Subscription этого поля БОЛЬШЕ НЕТ — с API
    2026-07-29 оно переехало на позицию (`SubscriptionItem.current_period_end`),
    тем же поколением, что перенесло invoice.subscription в parent.subscription_details.

    Плоское поле оставлено вторым шагом на случай отката версии API.
    """
    items = getattr(subscription, "items", None)
    data = getattr(items, "data", None) if items is not None else None
    if data:
        end = getattr(data[0], "current_period_end", None)
        if end:
            return end
    return getattr(subscription, "current_period_end", None)


# Интервал Stripe → месяцев в нём. Обратное к stripe_catalog._INTERVALS; сверка
# двух таблиц держится ассертом в self-check ниже.
_MONTHS_PER_INTERVAL = {"month": 1, "year": 12}

# Средний месяц (365.25/12 суток) — делитель фолбэка по датам периода позиции.
_AVG_MONTH_SECONDS = 30.44 * 86400


def _period_months(stripe_invoice) -> int | None:
    """Сколько месяцев тарифа покрывает счёт. None — определить не удалось.

    Нужно АВТОСЧЕТАМ ПРОДЛЕНИЯ: `period_months` в метаданные кладёт наш checkout,
    и только первому счёту — последующие Stripe генерирует сам. Метаданные
    подписки лежат при этом на верхнем уровне не во всех версиях API (с
    2026-07-29 они переехали в `parent.subscription_details`), поэтому опираться
    на них нельзя: на старой версии эндпоинта период пинился к 1, и 12-месячный
    тариф выглядел в истории счетов и в чеке оплаченным на месяц.

    Читаем ПОЗИЦИЮ счёта, а не подписку: `lines` есть в теле события на любой
    версии API, тогда как поля самой подписки между версиями переезжали.
    """
    lines = getattr(stripe_invoice, "lines", None)
    data = getattr(lines, "data", None) if lines is not None else None
    if not data:
        return None
    line = data[0]

    # Точный путь: интервал Price из нашего же каталога (stripe_catalog._INTERVALS).
    recurring = getattr(getattr(line, "price", None), "recurring", None)
    per_interval = _MONTHS_PER_INTERVAL.get(getattr(recurring, "interval", "") or "")
    if per_interval:
        return (getattr(recurring, "interval_count", 1) or 1) * per_interval

    # ponytail: фолбэк — длина периода позиции, округлённая до месяцев. Неточен в
    # принципе, но для наших четырёх периодов (1/6/12/24) однозначен с запасом:
    # ближайший сосед отстоит на порядок дальше ошибки округления. Понадобятся
    # экзотические интервалы (неделя, день) — считать по ним, а не по этой шкале.
    period = getattr(line, "period", None)
    start = getattr(period, "start", None) if period is not None else None
    end = getattr(period, "end", None) if period is not None else None
    # Сверка именно с None: `not start` отбрасывал бы и легальный timestamp 0.
    if start is None or end is None or end <= start:
        return None
    return max(1, round((end - start) / _AVG_MONTH_SECONDS))


async def _adopt_local_invoice(
    db: AsyncSession, plan: StudioBillingPlan, stripe_id: str, metadata,
) -> BillingInvoice | None:
    """Наша строка счёта, которой Stripe-счёт ещё не приписан, или None.

    Счета постоплаты (комиссия, минимум, фактура за онлайн) заводятся строкой в БД
    ДО похода в Stripe, и её id уезжает в метаданные при выпуске
    (services/offline_fee_billing._issue_to_stripe).

    Без этого захода событие, обогнавшее наш `commit`, заводило ВТОРУЮ строку с тем же
    `stripe_invoice_id`, наше присваивание падало на уникальном индексе, счёт оставался
    без ссылки — и `_finish_pending` следующим часом выпускал студии второй документ за
    тот же месяц. Окно крошечное, но у фактуры за онлайн-комиссию оно гарантированно
    попадает в цель: `create_settled_invoice` закрывает счёт сам (`Invoice.pay`), и
    `invoice.paid` вылетает ровно в этот момент.

    Ищем строго по паре (id, студия) и только среди НЕПРИПИСАННЫХ: чужой или уже
    связанный счёт метаданными не перехватывается.
    """
    local_id = getattr(metadata, "invoice_id", None) if metadata is not None else None
    if not local_id:
        return None
    try:
        local_id = int(local_id)
    except (TypeError, ValueError):
        logger.error("Stripe billing: invoice_id=%r в метаданных не число", local_id)
        return None

    row = (await db.execute(
        select(BillingInvoice).where(
            BillingInvoice.id == local_id,
            BillingInvoice.studio_id == plan.studio_id,
            BillingInvoice.stripe_invoice_id.is_(None),
        )
    )).scalar_one_or_none()
    if row is not None:
        row.stripe_invoice_id = stripe_id
        logger.info("Stripe billing: счёт %s привязан к строке %s по метаданным", stripe_id, local_id)
    return row


async def _supersede_unpaid(db: AsyncSession, fresh: BillingInvoice) -> None:
    """Новый счёт за тариф закрывает прежние НЕОПЛАЧЕННЫЕ счета за тариф.

    Правило: у студии в любой момент висит РОВНО ОДИН счёт за тариф. Неудавшийся
    переход (закрыли вкладку, карта отклонила, ушли со страницы Stripe) оставлял
    открытый счёт-прорацию, следующая попытка добавляла второй — и Stripe дожимал
    оба, списывая за один и тот же тариф дважды. Новый счёт всегда покрывает ту же
    сумму целиком, поэтому старому оставаться незачем.

    ОПЛАЧЕННЫЕ, возвращённые и уже закрытые не трогаем: история счетов и фактуры —
    документы отчётности, задним числом они не переписываются. Отбор по
    `status == "pending"` это и обеспечивает.

    Счета за КОМИССИЮ (offline_fee / min_monthly / online_fee) под правило не
    попадают СОЗНАТЕЛЬНО, и это не недоделка: каждый из них закрывает СВОИ
    начисления (`OfflineTransactionFee.invoice_id`), которые в новый счёт уже не
    переедут. Погасить прежний значило бы стереть долг студии перед платформой, а
    не убрать дубль. Дублей там нет и без этого — `offline_fee_billing.bill_now`
    второй счёт при открытом первом не выставляет.

    Stripe отвечает отказом → счёт остаётся как был, и обработка не срывается:
    оплата нового важнее уборки старого. Такой счёт закроет ручная сверка.
    """
    if fresh.kind != "subscription":
        return
    stale = (await db.execute(
        select(BillingInvoice).where(
            BillingInvoice.studio_id == fresh.studio_id,
            BillingInvoice.kind == "subscription",
            BillingInvoice.status == "pending",
            BillingInvoice.id != fresh.id,
        )
    )).scalars().all()

    for old in stale:
        if old.stripe_invoice_id:
            try:
                if not await stripe_billing.void_invoice(old.stripe_invoice_id):
                    # Гасить не наше дело: он уже оплачен (тогда статус — работа для
                    # сверки, а не наша выдумка) либо это счёт очередного цикла,
                    # который Stripe выставил за уже идущий период.
                    logger.warning(
                        "Счёт %s студии %s оставлен открытым: гасить его не наше дело",
                        old.stripe_invoice_id, old.studio_id,
                    )
                    continue
            except Exception:
                logger.exception(
                    "Счёт %s студии %s не погашен — остаётся открытым",
                    old.stripe_invoice_id, old.studio_id,
                )
                continue
        old.status = "failed"
        logger.info(
            "Счёт %s студии %s закрыт: выставлен новый счёт за тариф (%s)",
            old.id, old.studio_id, fresh.id,
        )


async def mirror_invoice(
    db: AsyncSession, plan: StudioBillingPlan, stripe_invoice,
) -> BillingInvoice:
    """Зеркало счёта Stripe в нашей БД (upsert по stripe_invoice_id).

    Идемпотентность держится на уникальном stripe_invoice_id: ретрай вебхука
    находит существующую строку, а не заводит вторую.
    """
    stripe_id = stripe_invoice["id"]
    row = (await db.execute(
        select(BillingInvoice).where(BillingInvoice.stripe_invoice_id == stripe_id)
    )).scalar_one_or_none()

    metadata = getattr(stripe_invoice, "metadata", None)
    if row is None:
        row = await _adopt_local_invoice(db, plan, stripe_id, metadata)
    if not getattr(metadata, "plan", None):
        # У автогенерируемых счетов цикла подписки метаданных на верхнем уровне НЕТ —
        # с API 2026-07-29 Stripe кладёт их в parent.subscription_details.metadata.
        # На версиях СТАРШЕ этого поколения нет и `parent` — период тогда достаём
        # из позиции счёта (_period_months), а не из метаданных вовсе.
        parent = getattr(stripe_invoice, "parent", None)
        details = getattr(parent, "subscription_details", None) if parent else None
        metadata = getattr(details, "metadata", None) or metadata
    plan_name = getattr(metadata, "plan", None) if metadata is not None else None
    period = getattr(metadata, "period_months", None) if metadata is not None else None
    # Счёт за комиссию помечает себя сам (services/offline_fee_billing). Нужно и
    # на случай, когда вебхук обогнал нашу запись строки: без маркера такой счёт
    # при оплате поднял бы студии ступень тарифа за чужие деньги.
    kind = (getattr(metadata, "kind", None) if metadata is not None else None) or "subscription"
    # На сколько месяцев продлевает этот счёт (routers/billing/checkout._renewal_invoice).
    # Пусто у всех остальных — они меняют тариф, а не добавляют срок.
    renew_months = getattr(metadata, "renew_months", None) if metadata is not None else None
    fields = dict(
        studio_id=plan.studio_id,
        kind=kind,
        plan_name=plan_name or plan.plan_name,
        period_months=int(period) if period else (_period_months(stripe_invoice) or 1),
        amount=getattr(stripe_invoice, "amount_due", 0) or 0,
        # Онлайн-комиссию не переводили ни картой, ни по IBAN: Stripe удержал её из
        # платежа клиента, а фактура выпущена постфактум закрытой. Она технически
        # send_invoice (см. create_settled_invoice), и без этой ветки счёт показывал
        # бы студии способ оплаты «IBAN» по деньгам, которых она не переводила.
        payment_method=(
            "stripe" if kind == "online_fee"
            else "iban" if getattr(stripe_invoice, "collection_method", "") == "send_invoice"
            else "card"
        ),
        hosted_invoice_url=getattr(stripe_invoice, "hosted_invoice_url", None),
        pdf_url=getattr(stripe_invoice, "invoice_pdf", None),
    )
    if renew_months:
        # Счёт продления: сколько месяцев куплено. Хранится в period_months —
        # отдельного поля не заводим, смысл ровно тот же («за сколько заплачено»),
        # и история счетов показывает его без единой правки.
        fields["period_months"] = int(renew_months)

    if row is None:
        row = BillingInvoice(stripe_invoice_id=stripe_id, status="pending", **fields)
        db.add(row)
        await db.flush()
        # Именно здесь, а не у каждой кнопки: через mirror_invoice проходят ВСЕ
        # счета — и смена тарифа, и продление, и то, что завёл сам Stripe. Правило
        # «один счёт за тариф» должно держаться независимо от того, откуда счёт
        # пришёл. Ветка создания, а не обновления: событие по УЖЕ известному счёту
        # (ретрай, финализация, оплата) новым счётом не является и гасить ничего
        # не должно.
        await _supersede_unpaid(db, row)
    else:
        for key, value in fields.items():
            # Ссылки на PDF Stripe заполняет при финализации, а не в каждом событии;
            # 0/None/"" из усечённого события не должны затирать уже верное значение
            # (иначе ретрай без amount_due обнуляет уже правильную сумму счёта).
            if value not in (None, "", 0):
                setattr(row, key, value)
    return row


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Колбэк Stripe по подписке на тариф."""
    event = stripe_billing.parse_webhook(
        await request.body(), request.headers.get("stripe-signature", ""),
    )
    if event is None:
        # 400, а НЕ 200. Подпись не сходится почти всегда по одной причине —
        # РАЗЪЕХАВШИЙСЯ СЕКРЕТ (ротация ключа в дашборде, чужой .env, перепутанные
        # местами секреты кассы и биллинга). При 200 Stripe считает доставку
        # удачной: ретраев нет, в дашборде зелено, в лог никто не смотрит — и
        # тариф молча перестаёт активироваться У ВСЕХ, пока кто-нибудь не
        # пожалуется. С 400 доставка помечается неудачной, Stripe ретраит трое
        # суток и присылает письмо о падающем эндпоинте: о поломке узнаём мы, а
        # не студия. Посторонний мусор из интернета до статистики Stripe не
        # доходит вовсе — он ей не доставлялся.
        raise HTTPException(status_code=400, detail="invalid signature")

    # Тариф платят ПЛАТФОРМЕ, и событий подключённых аккаунтов тут быть не может.
    # У них заполнено `account`, а объекты на своём аккаунте создаёт его владелец —
    # без этой проверки студия выписывала бы себе оплаченный счёт, заплатив ту же
    # сумму самой себе (деньги садятся на её же баланс). Та же проверка живёт в
    # кассе: checkout/stripe_pay.py, apply_paid.
    connected = getattr(event, "account", None)
    if connected:
        logger.warning("Stripe billing: событие подключённого аккаунта %s отброшено", connected)
        return {"status": "ignored"}

    # У StripeObject (stripe 15.x) НЕТ метода .get() — это не dict. Обращение к
    # возможно отсутствующему полю только через getattr с дефолтом, иначе
    # AttributeError роняет хендлер в 500, и Stripe трое суток ретраит впустую.
    obj = event["data"]["object"]
    event_type = event["type"]

    async with async_session_maker() as db:
        try:
            if event_type.startswith("customer.subscription."):
                await _handle_subscription(db, event_type, obj)
            elif event_type.startswith("invoice."):
                await _handle_invoice(db, event_type, obj)
            elif event_type == "charge.refunded":
                await _handle_refund(db, obj)
            elif event_type == "setup_intent.succeeded":
                await _handle_setup_intent(db, obj)
            elif event_type == "customer.tax_id.updated":
                await _handle_tax_id(db, obj)
        except Exception:
            # 500, а НЕ 200. Stripe ретраит ТОЛЬКО non-2xx (трое суток с откатом), и
            # проглоченная здесь ошибка означала, что ретрая не будет вовсе: событие
            # терялось навсегда. По `invoice.paid` это «деньги взяли, подписку не
            # активировали» — студия с оплаченным тарифом упирается в 402, а починить
            # это может только ручная сверка, и та лишь если строка счёта успела
            # появиться (упасть могла как раз она).
            #
            # Повтор безопасен: все хендлеры идемпотентны (уникальные
            # stripe_invoice_id / stripe_subscription_id / external_id + сверка статуса
            # в apply_status), поэтому гонка двух параллельных доставок чинится тем же
            # ретраем, ради которого мы и отдаём 500.
            logger.exception(
                "Stripe billing: событие %s не обработано — отдаём 500 под ретрай Stripe",
                event_type,
            )
            raise

    return {"status": "ok"}


async def _handle_subscription(db: AsyncSession, event_type: str, obj) -> None:
    """Зеркалирование статуса и срока подписки."""
    plan = await find_plan_by_subscription(db, obj["id"], _customer_id(obj))
    if plan is None:
        logger.info("Stripe billing: подписка %s не привязана к студии", obj["id"])
        return

    if event_type == "customer.subscription.deleted":
        plan.status = "expired"
        # Гейт (dependencies.py) смотрит на дату, а не только на статус: без
        # прижатия студия вернула бы деньги и доработала период бесплатно.
        plan.expires_at = datetime.utcnow()
        # Ссылку на мёртвую подписку снимаем, иначе повторное оформление оставит
        # план указывающим на отменённый объект: привязка по клиенту пропустит
        # запись (id ещё truthy), а следующая смена тарифа уйдёт в несуществующую
        # подписку и вернёт 502.
        plan.stripe_subscription_id = None
    else:
        # Порядок доставки Stripe НЕ гарантирует: отставшее событие несёт устаревшее
        # состояние, и зеркалить его как есть значит откатить подписку назад —
        # например вернуть past_due с прошлым, уже истёкшим current_period_end. Гейт
        # (dependencies.py) смотрит на дату, так что платящая студия получала бы 402.
        #
        # Поэтому источником берём не тело события, а текущее состояние подписки у
        # Stripe: оно одно и то же, в каком бы порядке события ни пришли. Сбой запроса
        # — откат на тело события (не хуже прежнего поведения), а не потеря обновления.
        try:
            obj = await stripe_billing.fetch_subscription(obj["id"])
        except Exception:
            logger.warning(
                "Stripe billing: подписку %s не удалось перечитать, зеркалим тело события",
                obj["id"], exc_info=True,
            )

        _mirror_subscription_state(plan, obj)

    await db.commit()


def _mirror_subscription_state(plan: StudioBillingPlan, subscription) -> None:
    """Состояние подписки у Stripe → строка студии. Ничего не коммитит.

    Общая точка вебхука (_handle_subscription) и автосверки
    (reconcile_subscriptions): правило «когда двигать expires_at» обязано быть
    ОДНИМ. Разъехавшись, сверка выдала бы оплаченный период тому, кому вебхук его
    сознательно не выдал, — и наоборот.
    """
    plan.status = map_subscription_status(getattr(subscription, "status", ""))
    # Автопродление — тоже состояние подписки у Stripe, а не наша настройка: владелец
    # мог выключить его кнопкой в CRM (router.update_autopay), а мог отменить подписку
    # прямо в письме Stripe или в его портале. Зеркалим, чтобы «Автоматическое
    # продление» в интерфейсе показывало то, что произойдёт на самом деле.
    plan.auto_renewal = not getattr(subscription, "cancel_at_period_end", False)
    if plan.status == "expired":
        plan.expires_at = datetime.utcnow()
    elif plan.status in ("active", "past_due"):
        period_end = _period_end(subscription)
        if period_end:
            plan.expires_at = datetime.utcfromtimestamp(period_end)
        else:
            logger.error(
                "Stripe billing: не удалось прочитать конец периода подписки %s — "
                "expires_at не обновлён, студия рискует получить 402 при живой оплате",
                getattr(subscription, "id", "?"),
            )
    # `pending` (incomplete): Stripe проставляет период ЕЩЁ ДО того, как деньги
    # прошли — SCA не пройден, карта не списана. Двигать expires_at здесь значит
    # выдать оплаченный период неоплатившему: гейт (dependencies.py) смотрит на дату.


async def _handle_invoice(db: AsyncSession, event_type: str, obj) -> None:
    """Зеркалирование счёта и его статуса.

    Сумму с нашим расчётом НЕ сверяем: её считает Stripe по Price, Stripe Tax и
    прорейтингу, и `amount_for()` о них не знает. Защита от чужого события — в том,
    что подписка из счёта обязана принадлежать студии в нашей БД, а Price заведён
    нами (services/stripe_catalog.py).
    """
    plan = await find_plan_by_subscription(db, _subscription_id(obj), _customer_id(obj))
    if plan is None:
        logger.info("Stripe billing: счёт %s не привязан к подписке студии", obj["id"])
        return

    currency = getattr(obj, "currency", None)
    if currency is not None and str(currency).lower() != stripe_billing.CURRENCY:
        logger.error(
            "Stripe billing: валюта счёта %s не сходится — пришло %s, ожидалось %s",
            obj["id"], currency, stripe_billing.CURRENCY,
        )
        return

    invoice = await mirror_invoice(db, plan, obj)

    status = _INVOICE_STATUS.get(event_type)
    if status is not None:
        # Счёт продления несёт число месяцев в метаданных, а не в нашей строке:
        # `period_months` есть у любого счёта за тариф, и по нему продление от
        # обычной оплаты не отличить.
        await apply_status(db, invoice, status, renew_months=_renew_months(obj))
    else:
        await db.commit()


def _renew_months(stripe_invoice) -> int | None:
    """На сколько месяцев продлевает счёт, или None.

    Метаданные читаем ровно там же, где их ставит checkout._renewal_invoice — на
    самом счёте. У автосчетов цикла этого поля нет и быть не должно: они и так
    продлевают подписку сами, средствами Stripe.
    """
    metadata = getattr(stripe_invoice, "metadata", None)
    value = getattr(metadata, "renew_months", None) if metadata is not None else None
    try:
        return int(value) if value else None
    except (TypeError, ValueError):
        logger.error("Stripe billing: renew_months=%r не число — продление пропущено", value)
        return None


async def _handle_setup_intent(db: AsyncSession, obj) -> None:
    """Карта привязана без списания (POST /billing/payment-method/setup).

    Для тарифа «только процент» это единственный способ появиться карте, а без
    неё гейт студию не пускает и ежемесячный счёт за комиссию списать не с чего.
    Делаем её ДЕФОЛТНОЙ у Customer'а — иначе Stripe не спишет по ней счёт сам.
    """
    customer_id = _customer_id(obj)
    if not customer_id:
        return

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.stripe_customer_id == customer_id)
    )).scalar_one_or_none()
    if plan is None:
        logger.info("Stripe billing: привязка карты клиента %s не найдена по студии", customer_id)
        return

    method = getattr(obj, "payment_method", None)
    method_id = method if isinstance(method, str) else getattr(method, "id", None)
    if not method_id:
        return

    # Событие несёт только id метода — за маской карты идём отдельно.
    try:
        await stripe_billing.set_default_payment_method(customer_id, method_id)
        intent = await stripe_billing.fetch_setup_intent(obj["id"])
    except Exception:
        logger.exception("Stripe billing: карта %s не привязана к клиенту %s", method_id, customer_id)
        return

    card = getattr(getattr(intent, "payment_method", None), "card", None)
    if card is None:
        return

    await _save_card(db, plan, method_id, card)
    await db.commit()


# Статус сверки налогового номера с VIES, по которому номер снимается. РОВНО ОДИН:
# `verified` — номер настоящий; `pending` — сверка ещё идёт (а в test-режиме Stripe
# висит так всегда); `unavailable` — проверить не удалось (VIES лежал, тип номера
# без сверки). Снять номер по этим трём значит начать брать НДС с честной студии
# из-за чужого сбоя — при том, что деньги платформа при этом не теряет.
_VAT_REJECTED = "unverified"


async def _handle_tax_id(db: AsyncSession, obj) -> None:
    """Пришла сверка VAT ID с VIES. `unverified` → номер снимаем у Stripe.

    Зачем: Stripe Tax применяет reverse charge (0 % НДС для юрлица из другой страны
    ЕС) по ФОРМАТУ номера, не дожидаясь сверки — `DE000000000` обнуляет налог ровно
    так же, как настоящий номер (проверено вызовами tax.Calculation на боевом ключе,
    см. stripe_billing.delete_tax_id). Сверка приезжает этим событием уже ПОСЛЕ
    оплаты. Если номер выдуманный, права продавать без НДС у нас не было, и 21 %
    налоговая снимет с ПЛАТФОРМЫ, а не со студии: деньги за тариф те же, а НДС из
    них вычтут. Отсюда правило — убрать номер до того, как по нему выпишется
    следующий счёт.

    Своя копия номера теперь есть — на аккаунте владельца (форма реквизитов), и её
    надо стереть той же рукой: иначе следующее оформление зальёт в Stripe обратно
    ровно тот номер, который мы только что сняли, и вся защита сведётся к отсрочке
    на одну оплату (checkout._ensure_customer).

    Признак «событие уже обработано» — ответ самого Stripe: `delete_tax_id` вернёт
    False, если номера уже не было, и ретрай не разошлёт студии второе письмо.
    """
    status = getattr(getattr(obj, "verification", None), "status", None)
    if status != _VAT_REJECTED:
        return

    customer_id = _customer_id(obj)
    if not customer_id:
        return

    value = getattr(obj, "value", None)
    # Падение сюда — 500 и ретрай Stripe (см. stripe_webhook): лучше повторить
    # попытку, чем оставить фиктивный номер обнулять налог дальше.
    if not await stripe_billing.delete_tax_id(customer_id, obj["id"]):
        return
    logger.warning(
        "Stripe billing: VAT ID %s клиента %s не прошёл сверку с VIES и снят у Stripe",
        value, customer_id,
    )

    studio = (await db.execute(
        select(Studio)
        .join(StudioBillingPlan, StudioBillingPlan.studio_id == Studio.id)
        .where(StudioBillingPlan.stripe_customer_id == customer_id)
    )).scalar_one_or_none()
    if studio is None:
        logger.info("Stripe billing: клиент %s не привязан к студии", customer_id)
        return

    # Стираем номер и у себя — по аккаунту владельца студии, потому что платит и
    # заполняет реквизиты только он. Сверка идёт по значению: владелец мог уже
    # вписать в форму другой номер, пока событие ехало, и затирать его нельзя.
    await db.execute(
        update(User)
        .where(
            User.id.in_(
                select(StudioMember.user_id).where(
                    StudioMember.studio_id == studio.id,
                    StudioMember.role == "owner",
                )
            ),
            User.billing_vat_id == value,
        )
        .values(billing_vat_id=None)
    )
    await db.commit()

    # Письмо своих ошибок наружу не пускает (как send_receipt): номер уже снят, и
    # упавший SMTP не повод получить ретрай применённого события.
    # Импорт локальный: модуль тянет notifier, а тот — половину моделей.
    from services.billing_mail import send_vat_rejected

    await send_vat_rejected(db, studio.id, value)


async def _handle_refund(db: AsyncSession, obj) -> None:
    """Возврат. Полный — переводит счёт в refunded и отменяет подписку, частичный
    (или без сумм в событии) не трогает ни счёт, ни подписку.

    Отмену делает Stripe по нашему запросу, а статус в БД подвинет пришедшее следом
    `customer.subscription.deleted` — сами его тут не проставляем, чтобы переход был
    один и тот же независимо от того, откуда пришёл возврат.
    """
    intent = getattr(obj, "payment_intent", None)
    intent_id = intent if isinstance(intent, str) else getattr(intent, "id", None)
    stripe_invoice_id = getattr(obj, "invoice", None)
    stripe_invoice_id = (
        stripe_invoice_id if isinstance(stripe_invoice_id, str)
        else getattr(stripe_invoice_id, "id", None)
    )
    if not stripe_invoice_id:
        logger.info("Stripe billing: возврат %s не привязан к счёту", intent_id)
        return

    invoice = (await db.execute(
        select(BillingInvoice).where(BillingInvoice.stripe_invoice_id == stripe_invoice_id)
    )).scalar_one_or_none()
    if invoice is None:
        return

    # Сумму сверяем ДО перевода счёта в refunded — он конечный (apply_status), и
    # частичный возврат не должен НЕОБРАТИМО потерять счёт. Событие без сумм
    # (amount=0, дефолт getattr) тоже не читаем как «вернули всё»: 0 < 0 иначе
    # ложно попадает в ветку полного возврата и отменяет платящую студию.
    amount = getattr(obj, "amount", 0) or 0
    refunded = getattr(obj, "amount_refunded", 0) or 0
    if not amount or refunded < amount:
        logger.info(
            "Stripe billing: частичный или без сумм возврат по счёту %s, счёт и подписку не трогаем",
            invoice.id,
        )
        return

    await apply_status(db, invoice, "refunded")

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()
    if plan and plan.stripe_subscription_id:
        try:
            await stripe_billing.cancel_subscription(plan.stripe_subscription_id)
        except Exception:
            logger.exception("Stripe billing: не удалось отменить подписку %s", plan.stripe_subscription_id)


async def reconcile_subscriptions(db: AsyncSession) -> int:
    """Перечитать у Stripe подписки, которые выглядят истёкшими. Вернуть число исправленных.

    Страховка на случай, когда события не доехали ВООБЩЕ. Ретраи Stripe живут трое
    суток; эндпоинт, лежавший дольше (или проверявший подпись разъехавшимся
    секретом), теряет их навсегда. Тогда у платящей студии деньги списаны, а
    `expires_at` остался от прошлого периода — гейт (dependencies.py) смотрит на
    дату и отдаёт 402. Сама студия починить это не может: ручная сверка идёт по
    счёту (POST /invoices/{id}/sync), а счёта продления, который не зеркалился, в
    её списке нет вовсе.

    Берём только тех, у кого есть ссылка на подписку и срок уже вышел (или выйдет
    в ближайшие сутки): остальные и так в порядке, ходить за ними в Stripe незачем.
    Статус `expired` из выборки исключён — там подписка мертва и по нашим данным, и
    у Stripe, а вернуть её к жизни может только новая оплата через checkout.

    Истина — состояние подписки у Stripe, тем же зеркалом, что и в вебхуке
    (_mirror_subscription_state). Сбой по одной студии не должен ронять остальные.
    """
    horizon = datetime.utcnow() + timedelta(days=1)
    plans = (await db.execute(
        select(StudioBillingPlan).where(
            StudioBillingPlan.stripe_subscription_id.isnot(None),
            StudioBillingPlan.status.in_(("active", "past_due", "pending")),
            or_(
                StudioBillingPlan.expires_at.is_(None),
                StudioBillingPlan.expires_at < horizon,
            ),
        )
    )).scalars().all()

    fixed = 0
    for plan in plans:
        # auto_renewal здесь наравне со статусом и сроком: он тоже зеркало (владелец
        # мог отменить подписку в портале Stripe, а не в CRM), и без него изменение
        # одного лишь флага не попадало бы в `fixed` — коммита бы не случилось, и
        # перечитанное состояние молча выбрасывалось.
        before = (plan.status, plan.expires_at, plan.auto_renewal)
        try:
            subscription = await stripe_billing.fetch_subscription(plan.stripe_subscription_id)
        except Exception:
            logger.exception(
                "Автосверка: подписку %s студии %s перечитать не удалось",
                plan.stripe_subscription_id, plan.studio_id,
            )
            continue
        _mirror_subscription_state(plan, subscription)
        if (plan.status, plan.expires_at, plan.auto_renewal) != before:
            fixed += 1
            logger.warning(
                "Автосверка: студия %s разъехалась со Stripe — было %s до %s, стало %s до %s. "
                "Событие подписки до нас не доехало, проверьте доставку вебхука",
                plan.studio_id, before[0], before[1], plan.status, plan.expires_at,
            )

    if fixed:
        await db.commit()
    return fixed


def _add_months(moment: datetime, months: int) -> datetime:
    """Дата плюс N календарных месяцев. Без dateutil — его нет в requirements.

    День схлопывается к последнему числу месяца, если такого в нём нет: 31 января
    плюс месяц = 28 февраля, а не 3 марта. Иначе продление раз за разом
    накапливало бы студии лишние сутки.
    """
    total = moment.month - 1 + months
    year, month = moment.year + total // 12, total % 12 + 1
    return moment.replace(
        year=year, month=month, day=min(moment.day, calendar.monthrange(year, month)[1]),
    )


async def _extend_paid_period(db: AsyncSession, invoice: BillingInvoice, months: int) -> None:
    """Продлить подписку на оплаченные месяцы. Зовётся ПОСЛЕ коммита оплаты.

    Считаем от конца ТЕКУЩЕГО оплаченного периода, а не от сегодня: в этом весь
    смысл продления — купленные месяцы прибавляются к остатку, а не заменяют его.

    Сбой не откатывает оплату: счёт оплачен, и отдать Stripe 500 значит получить
    ретрай уже применённого события. Расхождение подберёт `reconcile_subscriptions`
    только если Stripe успел изменить подписку — поэтому кричим в лог.
    """
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()
    if plan is None or not plan.stripe_subscription_id:
        logger.error(
            "Продление: у студии %s нет живой подписки — счёт %s оплачен, срок не сдвинут",
            invoice.studio_id, invoice.id,
        )
        return

    try:
        subscription = await stripe_billing.fetch_subscription(plan.stripe_subscription_id)
        current_end = _period_end(subscription)
        if not current_end:
            raise RuntimeError("у подписки не читается конец периода")
        new_end = _add_months(datetime.utcfromtimestamp(current_end), months)
        # Price будущих списаний — купленного периода: студия могла продлить
        # помесячный тариф сразу на год, и дальше он должен идти годовым.
        price_id = await stripe_catalog.price_id(
            invoice.plan_name, months, plan.billing_mode == "combo",
        )
        await stripe_billing.extend_subscription(
            plan.stripe_subscription_id, price_id,
            int(new_end.replace(tzinfo=timezone.utc).timestamp()),
        )
    except Exception:
        logger.exception(
            "Продление: счёт %s студии %s ОПЛАЧЕН, но срок подписки не сдвинут — разбор вручную",
            invoice.id, invoice.studio_id,
        )
        return

    logger.info(
        "Продление: студии %s добавлено %s мес., подписка оплачена до %s",
        invoice.studio_id, months, new_end,
    )


async def apply_status(
    db: AsyncSession, invoice: BillingInvoice, status: str, *,
    subscription=None, renew_months: int | None = None,
) -> bool:
    """Переводит счёт в статус, подтверждённый Stripe. True — если что-то изменилось.

    Общая точка вебхука и ручной сверки (POST /invoices/{id}/sync): переход один и
    тот же, откуда бы правда ни пришла. Идемпотентно — повтор конечного статуса по
    уже переведённому счёту ничего не делает, поэтому ретраи Stripe не начисляют
    тариф дважды.
    """
    if invoice.status == status:
        return False
    # Оплаченный счёт назад в неоплаченный не роняем: событие о неудачной попытке
    # может прийти уже ПОСЛЕ успешной оплаты другим способом. Для past_due это
    # важнее вдвойне — иначе отставшее событие заблокировало бы рассчитавшуюся студию.
    if invoice.status == "paid" and status == "failed":
        return False
    # Возврат — конечное состояние. Без этой строки ручная сверка по возвращённому
    # счёту начисляла бы период второй раз — уже без денег.
    if invoice.status == "refunded":
        return False

    if status == "paid":
        invoice.status = "paid"
        invoice.paid_at = datetime.utcnow()
        await _activate(db, invoice)
        # Доход платформы — в леджер, в той же транзакции, что и отметка об оплате:
        # разъехаться они не должны. Идемпотентность — по stripe_invoice_id.
        source = _REVENUE_SOURCE.get(invoice.kind)
        if invoice.stripe_invoice_id and source is not None:
            from services.platform_fee import record_revenue

            await record_revenue(
                db, invoice.studio_id, source,
                invoice.amount, stripe_billing.CURRENCY,
                f"in:{invoice.stripe_invoice_id}",
            )
    elif status in ("failed", "refunded"):
        invoice.status = status
        # Возврат снимает и записанный по счёту доход платформы — компенсирующей
        # строкой, а не удалением исходной: леджер не переписывается задним числом
        # (тот же принцип, что у Операций в кассе), а суммирование через func.sum
        # само учтёт минус. Идемпотентность — на своём external_id.
        source = _REVENUE_SOURCE.get(invoice.kind) if status == "refunded" else None
        if source is not None and invoice.stripe_invoice_id:
            from services.platform_fee import record_revenue

            await record_revenue(
                db, invoice.studio_id, source,
                -invoice.amount, stripe_billing.CURRENCY,
                f"rev:in:{invoice.stripe_invoice_id}",
            )
    else:
        return False

    await db.commit()

    # Поход в Stripe — ТОЛЬКО после коммита. Внутри транзакции он держал бы блокировки
    # строк всё время синхронного запроса, а Stripe бросает вебхук примерно на 20-й
    # секунде и ретраит: каждый ретрай упирался бы в те же блокировки. Срок периода к
    # этому моменту уже зеркалит customer.subscription.updated (_handle_subscription,
    # сети не требует), так что здесь остаётся только маска карты — не настолько
    # критичная, чтобы платить за неё блокировками строк.
    if status == "paid":
        # Продление — до синхронизации карты: срок важнее косметики, и упавший
        # запрос за маской карты не должен отменить сдвиг оплаченного периода.
        if renew_months:
            await _extend_paid_period(db, invoice, renew_months)

        plan = (await db.execute(
            select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
        )).scalar_one_or_none()
        if plan and plan.stripe_subscription_id:
            # Режим — из ТОЙ ЖЕ подписки, которую прочитал _sync_card: два запроса
            # за одним объектом на денежном пути ни к чему, а брать состояние из
            # двух моментов времени тем более.
            subscription = await _sync_card(db, plan, subscription)
            if subscription is not None:
                _apply_paid_mode(plan, subscription)
            await db.commit()
        # Чек владельцу — тоже после коммита и тоже не роняет обработку: тариф уже
        # оплачен, и упавший SMTP не повод отдать Stripe 500 и получить ретрай уже
        # применённого события (send_receipt глотает свои ошибки сам).
        # Импорт локальный: модуль тянет notifier, а тот — половину моделей.
        from services.billing_mail import send_platform_income, send_receipt

        await send_receipt(db, invoice)
        # Копия платформе. Отдельным вызовом, а не внутри send_receipt: тот молчит
        # при выключенном владельцем тумблере «Чек на email», а отчётность
        # платформы отключаться настройкой студии не должна.
        await send_platform_income(db, invoice)

    return True


async def _activate(db: AsyncSession, invoice: BillingInvoice) -> None:
    """paid → тариф и лимиты студии по оплаченному счёту.

    Срок (`expires_at`) здесь НЕ считаем: его ставит зеркало подписки из
    `current_period_end` (_handle_subscription). Своей арифметики периодов больше нет.
    Карту (Stripe round-trip) сюда тоже не зовём — это сделает apply_status ПОСЛЕ
    commit, вне пишущей транзакции (см. её комментарий).
    Счёт за комиссию подписку НЕ трогает: это оплата уже оказанной услуги, а не
    покупка периода. Без этого выхода погашение долга поднимало бы статус
    подписки в active — студия с истёкшим тарифом продлевала бы себе доступ,
    заплатив собственную комиссию.
    """
    if invoice.kind != "subscription":
        return

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()
    if plan is None:
        return

    plan.status = "active"
    if invoice.plan_name in PLANS:
        plan.plan_name = invoice.plan_name
        limits = PLANS[invoice.plan_name]["limits"]
        plan.max_staff = limits["staff"] or 9999  # None (business) = безлимит
        # Отложенный апгрейд наступил — снимаем подпись «тариф сменится с …».
        # Сверяем с именем оплаченного счёта: посторонний счёт не должен гасить
        # ещё не наступившую смену.
        if plan.scheduled_plan == invoice.plan_name:
            plan.scheduled_plan = None
            plan.scheduled_at = None


async def _sync_card(
    db: AsyncSession, plan: StudioBillingPlan, subscription=None,
) -> None:
    """Маска карты из Stripe. Вызывается ПОСЛЕ commit (см. apply_status) — вне
    пишущей транзакции, чтобы синхронный запрос к Stripe не держал блокировки строк.

    `subscription` — передаётся, если вызывающая сторона его уже получила (раскрытым,
    с `default_payment_method`); иначе фетчим сами. Сбой запроса не роняет активацию —
    тариф уже оплачен, карта — только удобство для кнопки «Продлить».

    Возвращает подписку, которой пользовалась: её же читает `_apply_paid_mode`, и
    второй раз ходить за тем же объектом на денежном пути незачем.
    """
    if subscription is None:
        try:
            subscription = await stripe_billing.fetch_subscription(plan.stripe_subscription_id)
        except Exception:
            logger.exception("Stripe billing: не удалось прочитать подписку %s", plan.stripe_subscription_id)
            return None

    method = getattr(subscription, "default_payment_method", None)
    card = getattr(method, "card", None) if method else None
    if card is None:
        return subscription

    # Карту привязываем к владельцу студии — единственному, кому доступны эндпоинты
    # биллинга (require_role("owner") в routers/billing/router.py). Счета студии
    # заводит владелец (user_id ставится в checkout.py), но не заводит вебхук —
    # автопродление на второй/третий период идёт без похода через checkout.py, и
    # искать «последний счёт с user_id» там было бы либо мимо (пусто), либо мимо
    # цели (случайный чужой счёт).
    await _save_card(db, plan, method.id, card)
    return subscription


def _apply_paid_mode(plan: StudioBillingPlan, subscription) -> None:
    """Тарифная модель — тоже по ОПЛАТЕ, а не по нажатию кнопки.

    ЖАЛОБА 14.08.2026: «нажал в комбо соглашаюсь, и меня перевело, хотя я не
    оплатил». `POST /billing/model` включал комбо сразу и переводил подписку на
    ПОЛОВИННЫЙ Price — студия с оплаченным периодом одним нажатием начинала
    платить вдвое меньше, не заплатив ничего. Теперь этот запрос выставляет счёт
    (router.activate_model → checkout._switch_now), а режим включается здесь,
    когда счёт оплачен, — ровно как ступень тарифа в `_activate`.

    Хранить «какой режим купили» отдельным полем не нужно: у комбо СВОЙ Price
    (`velora_combo_*`), то есть режим уже записан в подписке, за которую заплатили.
    Читаем оттуда — второй копии, которая однажды разъедется, не заводим.

    «Процент» сюда не попадает по определению: подписки у него нет, а значит нет и
    Price. Он и включается сразу, и дарить там нечего — фикс не уменьшается, а
    появляется обязательство платить комиссию с оборота и минимум.
    """
    parsed = stripe_catalog.parse_lookup_key(stripe_billing.price_key_of(subscription))
    if parsed is None:
        return
    plan_id, months, combo = parsed
    plan.billing_mode = "combo" if combo else "subscription"
    # Та же формула, что в router.activate_model: половина подписки со скидкой
    # периода. Ставка и сумма обязаны совпадать с тем, по чему выставляют счета.
    plan.percent_rate = COMBO_PERCENT_RATE if combo else None
    plan.fixed_base_amount = (
        round(COMBO_FIXED[plan_id] * (1 - PERIOD_DISCOUNTS[months])) if combo else None
    )


async def _save_card(db: AsyncSession, plan: StudioBillingPlan, method_id: str, card) -> None:
    """Маска карты владельцу студии. Общее для оплаты подписки (_sync_card) и
    привязки карты без списания (_handle_setup_intent) — гейт и ежемесячный счёт
    за комиссию читают одну и ту же строку, и заводить её двумя способами нельзя.

    Не коммитит: вызывающий решает, когда закрыть транзакцию.
    """
    owner_id = (await db.execute(
        select(StudioMember.user_id).where(
            StudioMember.studio_id == plan.studio_id,
            StudioMember.role == "owner",
            StudioMember.status == "active",
        )
    )).scalars().first()
    if owner_id is None:
        return

    row = (await db.execute(
        select(PaymentCard).where(PaymentCard.user_id == owner_id)
    )).scalar_one_or_none()
    fields = dict(
        card_last4=getattr(card, "last4", "") or "----",
        card_brand=getattr(card, "brand", "card"),
        card_expiry=f"{getattr(card, 'exp_month', 0):02d}/{str(getattr(card, 'exp_year', 0))[-2:]}",
        rectoken=method_id,
        stripe_customer_id=plan.stripe_customer_id,
        method_type="card",
    )
    if row is None:
        db.add(PaymentCard(user_id=owner_id, cardholder_name="", is_primary=True, **fields))
    else:
        for key, value in fields.items():
            setattr(row, key, value)


if __name__ == "__main__":
    import asyncio
    import types

    # Маппинг статусов: неизвестный трактуется как expired, а не как active.
    assert map_subscription_status("active") == "active"
    assert map_subscription_status("trialing") == "active"
    assert map_subscription_status("past_due") == "past_due"
    assert map_subscription_status("canceled") == "expired"
    assert map_subscription_status("unpaid") == "expired"
    assert map_subscription_status("что-то новое") == "expired"
    # incomplete → pending: _handle_subscription обязан НЕ двигать по нему expires_at
    # (SCA не пройден, денег ещё нет) — сам маппинг это не проверяет, но это условие
    # (`elif plan.status in ("active", "past_due")`) держится именно на этом значении.
    assert map_subscription_status("incomplete") == "pending"

    # Конец периода читается у ПОЗИЦИИ: у Subscription этого поля больше нет
    # (stripe 15.4.0 / API 2026-07-29-dahlia).
    _item = types.SimpleNamespace(current_period_end=1800000000)
    _sub = types.SimpleNamespace(items=types.SimpleNamespace(data=[_item]))
    assert _period_end(_sub) == 1800000000
    # Плоское поле — фолбэк на случай отката версии API.
    assert _period_end(types.SimpleNamespace(items=None, current_period_end=123)) == 123
    # Нет ни того ни другого — None, и вызывающая сторона обязана залогировать, не молчать.
    assert _period_end(types.SimpleNamespace(items=None)) is None

    # apply_status: ветки без похода в БД — повтор конечного статуса, откат paid, мусор.
    _fake_db = types.SimpleNamespace(commit=lambda: asyncio.sleep(0))
    # kind/stripe_invoice_id — то, по чему ветвится снятие дохода из леджера при
    # возврате. Пустая ссылка на счёт Stripe значит «снимать нечего», и ни одна
    # ветка ниже до записи в БД не доходит (у _fake_db нет execute — если дойдёт,
    # self-check упадёт, и это ровно та защита, которая тут нужна).
    _inv = lambda status: types.SimpleNamespace(  # noqa: E731
        status=status, kind="subscription", stripe_invoice_id=None, amount=3900, studio_id=1,
    )

    assert asyncio.run(apply_status(_fake_db, _inv("paid"), "paid")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("refunded"), "refunded")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("failed"), "failed")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("pending"), "processing")) is False

    _declined = _inv("pending")
    assert asyncio.run(apply_status(_fake_db, _declined, "failed")) is True
    assert _declined.status == "failed"

    # Неудачная попытка не должна обнулять уже прошедшую оплату.
    _paid = _inv("paid")
    assert asyncio.run(apply_status(_fake_db, _paid, "failed")) is False
    assert _paid.status == "paid"

    # Возврат конечен: сверка по возвращённому счёту не начисляет период второй раз.
    _returned = _inv("refunded")
    assert asyncio.run(apply_status(_fake_db, _returned, "paid")) is False
    assert _returned.status == "refunded"

    # id подписки достаётся из всех трёх форм, которыми его отдаёт Stripe.
    assert _subscription_id(types.SimpleNamespace(subscription="sub_1")) == "sub_1"
    assert _subscription_id(
        types.SimpleNamespace(subscription=types.SimpleNamespace(id="sub_2"))
    ) == "sub_2"
    assert _subscription_id(
        types.SimpleNamespace(
            subscription=None,
            parent=types.SimpleNamespace(
                subscription_details=types.SimpleNamespace(subscription="sub_3"),
            ),
        )
    ) == "sub_3"
    assert _subscription_id(types.SimpleNamespace(subscription=None, parent=None)) is None

    # id клиента — тоже строкой или объектом, тот же паттерн, что у подписки.
    # Это запасной путь линковки первой карточной оплаты (find_plan_by_subscription).
    assert _customer_id(types.SimpleNamespace(customer="cus_1")) == "cus_1"
    assert _customer_id(types.SimpleNamespace(customer=types.SimpleNamespace(id="cus_2"))) == "cus_2"
    assert _customer_id(types.SimpleNamespace(customer=None)) is None

    # Период автосчёта продления. Метаданных с `period_months` у него нет ни на
    # одной версии API, поэтому читается позиция счёта.
    def _inv_line(interval=None, count=1, start=None, end=None):
        price = types.SimpleNamespace(
            recurring=types.SimpleNamespace(interval=interval, interval_count=count),
        ) if interval else None
        return types.SimpleNamespace(lines=types.SimpleNamespace(data=[
            types.SimpleNamespace(price=price, period=types.SimpleNamespace(start=start, end=end)),
        ]))

    # Точный путь — интервал Price. Все четыре периода каталога.
    assert _period_months(_inv_line("month", 1)) == 1
    assert _period_months(_inv_line("month", 6)) == 6
    assert _period_months(_inv_line("year", 1)) == 12
    assert _period_months(_inv_line("year", 2)) == 24

    # Обратная таблица обязана сходиться с каталогом: разъедутся — период поедет.
    from services.stripe_catalog import _INTERVALS
    for _months, (_interval, _count) in _INTERVALS.items():
        assert _MONTHS_PER_INTERVAL[_interval] * _count == _months, (_interval, _count)

    # Фолбэк по датам периода (Price недоступен): округление обязано попадать в
    # тот же период, включая короткий февраль и високосный год.
    _DAY = 86400
    assert _period_months(_inv_line(start=0, end=28 * _DAY)) == 1
    assert _period_months(_inv_line(start=0, end=31 * _DAY)) == 1
    assert _period_months(_inv_line(start=0, end=181 * _DAY)) == 6
    assert _period_months(_inv_line(start=0, end=184 * _DAY)) == 6
    assert _period_months(_inv_line(start=0, end=365 * _DAY)) == 12
    assert _period_months(_inv_line(start=0, end=366 * _DAY)) == 12
    assert _period_months(_inv_line(start=0, end=730 * _DAY)) == 24

    # Определить нечем — None, и вызывающая сторона подставит 1, а не упадёт.
    assert _period_months(types.SimpleNamespace(lines=None)) is None
    assert _period_months(types.SimpleNamespace(lines=types.SimpleNamespace(data=[]))) is None
    # Разовая позиция счёта за комиссию: периода нет (start == end) — не месяц.
    assert _period_months(_inv_line(start=100, end=100)) is None

    assert "/webhook/stripe" in [r.path for r in router.routes]
    print("billing webhook self-check ok")
