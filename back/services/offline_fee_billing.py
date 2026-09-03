"""Месячный биллинг платформы: комиссия с офлайн-продаж, минимальный платёж и
фактура за онлайн-комиссию.

Онлайн-платёж расщепляет сам Stripe в момент оплаты (`application_fee_amount`),
а наличные, терминал и депозит проходят мимо платформы: её доля копится строками
`OfflineTransactionFee` и выставляется одним счётом.

Отсюда два принципиально разных вида документа, и путать их нельзя:

* **счёт** (`offline_fee`, `min_fee`) — денег ещё нет. Просит оплату, имеет срок,
  по его истечении блокирует студию;
* **фактура** (`online_fee`) — деньги УЖЕ удержаны Stripe при платеже клиента.
  Выпускается сразу закрытой (`paid_out_of_band`), оплату не просит и ничего не
  блокирует. Без неё студия не могла списать комиссию в расход, а платформа не
  имела документа на собственный доход.

Схема оплаты — БЕЗ автосписания (`collection_method="send_invoice"`): карту у
студии мы не спрашиваем. Stripe присылает счёт письмом со ссылкой на оплату;
студия платит когда угодно, в том числе досрочно — кнопкой в разделе «Тариф и
оплата» (`bill_now`).

Сроки:
- расчётный период — КАЛЕНДАРНЫЙ месяц. Первого числа выставляется всё, что
  накопилось до начала текущего месяца; текущий продолжает копиться;
- на оплату даётся `GRACE_DAYS` (неделя). `due_at` = момент выставления + неделя;
- срок прошёл, счёт не оплачен → `platform_fee.studio_suspended` = True, и
  блокируются И CRM, И мини-приложение.

Состояния «биллили ли мы в этом месяце» нигде не храним: предикат
`invoice_id IS NULL AND created_at < начало месяца` самодостаточен и
самовосстанавливается — пропущенный запуск догоняется следующим тиком.
"""
import asyncio
import logging
from datetime import datetime, timedelta

import aiohttp
from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from models import (
    BillingInvoice, FxRate, OfflineTransactionFee, PlatformRevenueLedger,
    StudioBillingPlan, Studio, StudioMember, User,
)
from services import billing_tax, stripe_billing

logger = logging.getLogger(__name__)

# Тик воркера. Час — с запасом: работа делается раз в месяц, промах на пару часов
# после полуночи первого числа никого не задевает.
_SLEEP_SECONDS = 3600

# Ключ advisory-лока: ASCII "velora" (48 бит, влезает в bigint Postgres).
# Константа, а не хэш имени: значение обязано совпадать во ВСЕХ процессах, иначе
# лок перестаёт что-либо разделять.
_LOCK_KEY = 0x76656C6F7261

# Сколько дней даётся на оплату счёта, прежде чем доступ закроется. Меняя это
# число, поменяй и текст согласия (routers/billing/router._OFFLINE_TERMS):
# студия соглашается на КОНКРЕТНЫЙ срок, и юридически он должен совпадать.
GRACE_DAYS = 7

# За сколько дней до блокировки шлём собственное письмо-предупреждение из CRM
# (см. _send_reminders, services.billing_mail.send_block_warning) — отдельно от
# письма Stripe по счёту.
REMINDER_DAYS = 2

# Курсы к валюте биллинга для студий, торгующих не в ней: комиссия начисляется в
# валюте продажи, а счёт Stripe обязан быть в валюте Customer'а (сменить её у
# клиента с историей нельзя). currency(lower) -> множитель в валюту биллинга.
#
# ХРАНИЛИЩЕ — БД (models.FxRate), кэш в памяти поверх неё. Курс тянется с ЕЦБ
# (frankfurter.dev) раз в сутки, и каждый УДАЧНЫЙ поход переписывает строки.
# Провайдер молчит — работаем на последнем записанном, сколько бы ни пришлось.
#
# Почему не файл (как было): кэш в памяти умирает с процессом, а файл во
# временном каталоге контейнера — с перезапуском. После перезапуска в день, когда
# ЕЦБ недоступен, курса не оставалось вовсе, и комиссии студий, торгующих не в
# валюте биллинга, не попадали в счёт до следующего успешного похода. В БД
# последний курс переживает и то, и другое.
_FX: dict[str, float] = {}
_fx_fetched_at: datetime | None = None
_FX_URL = "https://api.frankfurter.dev/v1/latest"
# ЕЦБ публикует ~30 валют, и ни UAH, ни RUB, ни KZT, ни AED в них нет (RUB снят с
# публикации в 2022). Для студий в этих деньгах курса не было вовсе: комиссия
# копилась, to_billing_currency отдавала None, счёт не выставлялся НИКОГДА, а
# виджет показывал долг в гривнах. Второй источник дозаполняет то, чего нет у ЕЦБ,
# и не трогает то, что ЕЦБ даёт: для евро-фактуры его курс остаётся эталонным.
_FX_FALLBACK_URL = "https://open.er-api.com/v6/latest/{base}"
_FX_TTL = timedelta(hours=24)


async def _load_fx(db: AsyncSession) -> None:
    """Поднять последний записанный курс из БД в память. Сбой — «курса нет».

    Берём строки только своей базовой валюты: сменили BILLING_CURRENCY — прежние
    множители посчитаны от других денег, и применить их значит выставить счета с
    коэффициентом от прошлой валюты.
    """
    try:
        rows = (await db.execute(
            select(FxRate.code, FxRate.rate).where(FxRate.base == stripe_billing.CURRENCY)
        )).all()
    except Exception:
        logger.exception("Офлайн-комиссии: курс не прочитан из БД")
        return
    if rows:
        _FX.update({code: float(rate) for code, rate in rows})
        logger.info("Офлайн-комиссии: курс поднят из БД (%s валют)", len(_FX))


async def _save_fx(db: AsyncSession) -> None:
    """Записать свежий курс в БД. UPSERT по паре (base, code) — одна строка на
    валюту, а не история: нужен только ПОСЛЕДНИЙ известный.

    Сбой записи не роняет биллинг: в памяти курс уже есть, счёт выставится, а
    следующий тик попробует записать снова.
    """
    if not _FX:
        return
    now = datetime.utcnow()
    try:
        for code, rate in _FX.items():
            await db.execute(
                pg_insert(FxRate)
                .values(base=stripe_billing.CURRENCY, code=code, rate=rate, fetched_at=now)
                .on_conflict_do_update(
                    constraint="uq_fx_rate_base_code",
                    set_={"rate": rate, "fetched_at": now},
                )
            )
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Офлайн-комиссии: курс не сохранён в БД")


async def _fetch_rates(url: str) -> dict[str, float]:
    """Множители «валюта → валюта биллинга» с одного источника. Пусто — не вышло.

    Сбой источника здесь и остаётся: биллинг работает на последнем записанном
    курсе, и падать из-за молчащего провайдера ему нельзя.
    """
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as resp:
                resp.raise_for_status()
                data = await resp.json(content_type=None)
    except Exception:
        logger.exception(
            "Офлайн-комиссии: курс валют с %s не получен, используется последний записанный",
            url,
        )
        return {}
    return {code.lower(): 1 / rate for code, rate in (data.get("rates") or {}).items() if rate}


async def _refresh_fx(db: AsyncSession) -> None:
    """Обновить курсы, если кэш старше суток. Молчит и не роняет биллинг.

    Сбой запроса НЕ чистит ни память, ни БД: вчерашний курс безопаснее полного
    отказа считать — иначе to_billing_currency вернула бы None на все офлайн-
    начисления, пока провайдер недоступен, и они зависли бы неучтёнными.
    Пустая память (холодный старт) поднимается из БД — там последний удачный.
    """
    global _fx_fetched_at
    if not _FX:
        await _load_fx(db)
    if _fx_fetched_at is not None and datetime.utcnow() - _fx_fetched_at < _FX_TTL:
        return

    base = stripe_billing.CURRENCY.upper()
    fresh: dict[str, float] = {}
    # Порядок значим: ЕЦБ первым, дозаполнение вторым — `**fresh` справа не даёт
    # второму источнику перебить первый. Собираем в отдельный словарь, а не в _FX
    # по ходу дела: иначе на вторые сутки дозаполнение видело бы курс ЕЦБ уже в
    # кэше и «своя» валюта (UAH) осталась бы с позавчерашним множителем.
    for url in (f"{_FX_URL}?base={base}", _FX_FALLBACK_URL.format(base=base)):
        fresh = {**await _fetch_rates(url), **fresh}

    if fresh:
        _FX.update(fresh)
        _fx_fetched_at = datetime.utcnow()
        await _save_fx(db)

# Ниже этой суммы (в младших единицах валюты биллинга) счёт не выставляем: Stripe
# отвергает платёж меньше минимального, а банковская комиссия съест остаток. Долг
# не пропадает — строки остаются неоплаченными и уедут в следующий счёт.
MIN_INVOICE_AMOUNT = 100


def month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def prev_month_start(month_begin: datetime) -> datetime:
    """Начало месяца, предшествующего `month_begin`. Через день назад — чтобы не
    городить арифметику с переходом через январь."""
    return month_start(month_begin - timedelta(days=1))


def period_label(month_begin: datetime) -> str:
    """Расчётный месяц как "YYYY-MM" — им подписан счёт и по нему держится
    уникальность (BillingInvoice.period)."""
    return month_begin.strftime("%Y-%m")


def to_billing_currency(amount: int, currency: str) -> int | None:
    """Сумма в валюте биллинга или None, если курс неизвестен.

    None — это «не выставлять», а не «выставить ноль»: молча недобрать комиссию
    хуже, чем отложить счёт до появления курса.
    """
    currency = currency.lower()
    if currency == stripe_billing.CURRENCY:
        return amount
    rate = _FX.get(currency)
    if rate is None:
        return None
    return round(amount * rate)


async def accrued_total(db: AsyncSession, studio_id: int) -> tuple[int, str]:
    """Начислено, но ещё не выставлено → (сумма, валюта).

    В валюте НАЧИСЛЕНИЯ (валюте студии), а не биллинга: виджет показывает
    владельцу сумму в тех деньгах, которыми он торгует. Конвертация — забота
    момента выставления счёта.
    """
    rows = (await db.execute(
        select(
            OfflineTransactionFee.currency,
            func.coalesce(func.sum(OfflineTransactionFee.fee_amount), 0),
        )
        .where(
            OfflineTransactionFee.studio_id == studio_id,
            OfflineTransactionFee.invoice_id.is_(None),
        )
        .group_by(OfflineTransactionFee.currency)
    )).all()
    if not rows:
        return 0, stripe_billing.CURRENCY.upper()
    # Валюта студии одна; несколько строк — только если её меняли в настройках.
    # Тогда показываем крупнейшую группу, а счёт всё равно сведёт всё в биллинг.
    currency, total = max(rows, key=lambda r: r[1])
    return int(total), currency.upper()


async def accrued_in_billing_currency(db: AsyncSession, studio_id: int) -> tuple[int, str]:
    """То же начисленное, но в ВАЛЮТЕ БИЛЛИНГА → (сумма, валюта).

    Виджет обязан показывать те деньги, которые придут в счёте: счёт Stripe всегда
    в валюте Customer'а, и «₴327,27» рядом с евровым минимальным платежом — две
    несопоставимые цифры на одной карточке. Курс берём тот же, по которому сумма
    уедет в счёт (`to_billing_currency`), — другого в продукте нет, и расходиться
    экрану со счётом нельзя.

    Курса нет — отдаём как начислено, в валюте студии: показать ноль значило бы
    соврать, что долга нет. В сеть отсюда не ходим (это обработчик запроса) —
    только поднимаем последний записанный курс; свежесть держит воркер.
    """
    accrued, currency = await accrued_total(db, studio_id)
    if accrued == 0:
        return 0, stripe_billing.CURRENCY.upper()
    if not _FX:
        await _load_fx(db)
    converted = to_billing_currency(accrued, currency)
    if converted is None:
        return accrued, currency
    return converted, stripe_billing.CURRENCY.upper()


async def has_unsettled_commission(db: AsyncSession, studio_id: int) -> bool:
    """Осталась ли за студией непогашенная постоплата. True — уходить с тарифа рано.

    Гейт перехода с «процента»/«комбо» на чистую подписку (routers/billing:
    activate_model и create_checkout). Комиссия с наличных начисляется весь месяц, а
    счёт по ней выставляется ПОСЛЕ его конца — то есть в любой день месяца за студией
    висит долг, о котором ещё не выставлен документ. Без этой проверки уход на
    фиксированный тариф стирал его молча: `_bill` собирает начисления по студиям, у
    которых есть НЕВЫСТАВЛЕННЫЕ строки, и выставит счёт и потом, но минимальный
    месячный платёж (`_bill_minimum`) берёт только тех, кто на проценте В МОМЕНТ
    ПРОХОДА, — месяц, отработанный на проценте и брошенный 30-го числа, не добирался
    до минимума вовсе.

    Считаем ОБЕ формы долга:
      * выставленный и неоплаченный счёт (`offline_fee`/`min_fee`) — независимо от
        того, наступил ли срок: блокировка ждёт срока, а переход ждать не обязан;
      * начисления, до счёта ещё не доехавшие.

    Порог у второй формы тот же, что у выставления (`MIN_INVOICE_AMOUNT`): три цента,
    которые никогда не станут счётом, иначе заперли бы студию на проценте навсегда.

    Курса нет — НЕ блокируем: долг в этом случае недоказуем, а запереть студию из-за
    недоступного справочника курсов хуже, чем недобрать. Свежесть курса тут не важна
    (сравнение идёт с одним евро), поэтому в сеть не ходим — берём записанный в БД.
    """
    # Локальный импорт: `platform_fee` тянет `routers.billing.plans`, а тот через
    # пакет — `router.py`, который импортирует ЭТОТ модуль (тот же цикл, что у
    # `_bill_minimum`).
    from services.platform_fee import SUSPENDING_KINDS

    unpaid = (await db.execute(
        select(BillingInvoice.id).where(
            BillingInvoice.studio_id == studio_id,
            BillingInvoice.kind.in_(SUSPENDING_KINDS),
            BillingInvoice.status.notin_(("paid", "refunded")),
        ).limit(1)
    )).first()
    if unpaid is not None:
        return True

    accrued, currency = await accrued_total(db, studio_id)
    if accrued <= 0:
        return False
    if not _FX:
        await _load_fx(db)
    converted = to_billing_currency(accrued, currency)
    return converted is not None and converted >= MIN_INVOICE_AMOUNT


async def _ensure_studio_customer(db: AsyncSession, plan: StudioBillingPlan) -> str | None:
    """Stripe Customer студии, заводя его при необходимости. None — не получилось.

    Раньше отсутствие customer'а просто отменяло счёт. А заводится он только в
    оплате тарифа (routers/billing/checkout._ensure_customer) — то есть студия,
    которая сразу выбрала «процент» и ни разу не заходила в оплату, не имела его
    вовсе, и выставить ей было нечего: ни комиссию, ни минимальный платёж. Тариф,
    счёт по которому невозможно выставить, — это бесплатный тариф.

    Реквизиты передаются ТОЛЬКО здесь и только при СОЗДАНИИ клиента. Этот счёт
    выставляем мы сами, хостед-страницы у него нет, а без местоположения Stripe Tax
    отвечает `customer_tax_location_invalid`. Затереть введённое плательщиком у
    Stripe эти поля не могут: ветка отрабатывает лишь тогда, когда клиента ещё нет.

    Источник реквизитов — ПРОФИЛЬ ВЛАДЕЛЬЦА (`User.billing_*`), тот же, что у оплаты
    тарифа (routers/billing/checkout._ensure_customer), и лишь при пустом профиле
    берутся поля студии. Причина не в аккуратности: адрес студии собирает онбординг,
    а он спрашивает только свободную строку — `country`, `city` и `postal_code` там
    остаются пустыми. Клиент без страны роняет ЛЮБОЙ счёт с automatic_tax, то есть
    percent-студия, ни разу не заходившая в оплату тарифа, не получала бы ни счёта за
    комиссию, ни минимального платежа вообще. Профиль владельца, наоборот, обязателен
    для включения процента (routers/billing/router.activate_model) и содержит все
    четыре поля.

    Номер НДС уезжает по тем же правилам, что и в оплате тарифа: только
    ПОДТВЕРЖДЁННЫЙ через VIES. Без него счёт за комиссию компании из другой страны ЕС
    уходил с полным чешским НДС вместо reverse charge — переплата, которую студии
    потом возвращать через поддержку.
    """
    # Тот же замок, что в оплате тарифа (routers/billing/checkout._ensure_customer),
    # и по той же причине: клиент у студии ровно один. Здесь спорят не две вкладки,
    # а месячный проход и оформление оплаты — владелец жмёт «Оплатить» ровно тогда,
    # когда ему пришёл счёт за комиссию. Второй Customer означал бы подписку на
    # одном, а счета постоплаты на другом.
    await db.execute(
        select(StudioBillingPlan)
        .where(StudioBillingPlan.studio_id == plan.studio_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if plan.stripe_customer_id:
        return plan.stripe_customer_id

    studio = (await db.execute(
        select(Studio).where(Studio.id == plan.studio_id)
    )).scalar_one_or_none()
    if studio is None:
        return None

    owner = (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(
            StudioMember.studio_id == plan.studio_id,
            StudioMember.role == "owner",
            StudioMember.status == "active",
        )
    )).scalars().first()

    # Профиль берётся целиком или не берётся вовсе: половина адреса — это тот же
    # `customer_tax_location_invalid`, только выглядящий как заполненные реквизиты.
    address = {}
    if owner is not None and all((
        owner.billing_country, owner.billing_line1,
        owner.billing_postal_code, owner.billing_city,
    )):
        address = dict(
            country=owner.billing_country,
            postal_code=owner.billing_postal_code,
            city=owner.billing_city,
            line1=owner.billing_line1,
            line2=owner.billing_line2,
        )
    elif studio.country:
        address = dict(
            country=studio.country,
            postal_code=studio.postal_code,
            city=studio.city,
            line1=studio.address,
        )

    try:
        customer_id = await stripe_billing.ensure_customer(
            None,
            name=studio.name,
            email=studio.email or (owner.email if owner is not None else None),
            studio_id=plan.studio_id,
            **address,
        )
    except Exception:
        logger.exception("Офлайн-комиссии: не удалось завести Stripe Customer студии %s", plan.studio_id)
        return None

    if address and owner is not None and owner.billing_vat_id and owner.billing_vat_verified:
        # Не роняем счёт: номер необязателен, а Stripe отбивает неизвестный формат
        # 400-й. Без него студия переплатит НДС, с упавшим счётом не заплатит ничего.
        try:
            await stripe_billing.set_tax_id(customer_id, owner.billing_vat_id)
        except Exception:
            logger.warning(
                "Офлайн-комиссии: VAT ID %s студии %s не принят Stripe",
                owner.billing_vat_id, plan.studio_id, exc_info=True,
            )

    plan.stripe_customer_id = customer_id
    # Коммитим сразу: ниже поход в Stripe, и потерять привязку значит завести
    # студии ВТОРОГО клиента на следующем проходе.
    await db.commit()
    return customer_id


async def _bill(
    db: AsyncSession, studio_id: int, cutoff: datetime | None, period: str | None = None,
) -> BillingInvoice | None:
    """Один счёт за все невыставленные начисления студии (до `cutoff`, если задан).

    `cutoff=None` — «выставить всё прямо сейчас», кнопка досрочной оплаты.

    `period` («YYYY-MM») ставит только ЕЖЕМЕСЯЧНЫЙ проход: он делает второй счёт за
    тот же месяц невозможным на уровне БД (uq_billing_invoice_period). Досрочная
    оплата period не ставит намеренно — она законно добавляет ещё один счёт в
    текущем месяце, и уникальность его бы запретила.

    Порядок операций денежный: СНАЧАЛА резервируем начисления локальным счётом и
    коммитим, и только потом идём в Stripe. Обратный порядок опасен — упади
    коммит после создания счёта у Stripe, начисления остались бы с invoice_id
    IS NULL и уехали бы во второй счёт следующим месяцем. Ключ идемпотентности
    Stripe тут не спасает: он живёт 24 часа, а повтор случится через месяц.
    Цена такого порядка — обратный сбой (зарезервировали, Stripe упал): счёт
    остаётся без stripe_invoice_id, его подберёт `_finish_pending`.
    """
    conditions = [
        OfflineTransactionFee.studio_id == studio_id,
        OfflineTransactionFee.invoice_id.is_(None),
    ]
    if cutoff is not None:
        conditions.append(OfflineTransactionFee.created_at < cutoff)

    fees = (await db.execute(
        select(OfflineTransactionFee).where(*conditions).with_for_update()
    )).scalars().all()
    if not fees:
        return None

    # ponytail: сетевой запрос внутри окна блокировки строк (fees уже заперты
    # with_for_update() выше). Обращений мало (раз в сутки на кэш, раз в месяц
    # на студию), поэтому не выносим отдельным шагом до select — не тот объём,
    # где это стало бы заметно.
    await _refresh_fx(db)

    total = 0
    billable: list[OfflineTransactionFee] = []
    for fee in fees:
        converted = to_billing_currency(fee.fee_amount, fee.currency)
        if converted is None:
            logger.error(
                "Офлайн-комиссии: нет курса %s→%s, начисление %s студии %s пропущено "
                "(курс не вернул frankfurter.dev — см. _refresh_fx)",
                fee.currency, stripe_billing.CURRENCY, fee.id, studio_id,
            )
            continue
        total += converted
        billable.append(fee)

    if not billable or total < MIN_INVOICE_AMOUNT:
        return None

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    customer_id = await _ensure_studio_customer(db, plan) if plan is not None else None
    if customer_id is None:
        logger.error(
            "Офлайн-комиссии: у студии %s нет Stripe Customer — счёт на %s не выставлен",
            studio_id, total,
        )
        return None

    invoice = BillingInvoice(
        studio_id=studio_id,
        plan_name="offline_fee",
        kind="offline_fee",
        period=period,
        period_months=1,
        amount=total,
        status="pending",
        payment_method="invoice",
        # Срок НЕ ставим здесь. Он ставится только тогда, когда счёт реально выдан
        # (_issue_to_stripe), и вот почему: эта строка коммитится ДО похода в Stripe,
        # а поход падает — например `customer_tax_location_invalid` у студии без
        # страны в реквизитах. Со сроком, проставленным заранее, через GRACE_DAYS
        # студию блокировал бы счёт, которого она никогда не получала: письма нет,
        # hosted_invoice_url пуст, а кнопка «Оплатить сейчас» бессильна — начисления
        # уже зарезервированы этой строкой, и bill_now не находит ничего нового.
        # Пустой due_at для suspension_reason означает «не блокирует», то есть
        # неудачная выдача теперь стоит платформе отсрочки, а не студии — доступа.
        due_at=None,
    )
    db.add(invoice)
    await db.flush()
    for fee in billable:
        fee.invoice_id = invoice.id
    await db.commit()

    await _issue_to_stripe(db, invoice, customer_id, _describe(invoice, len(billable)))
    return invoice


def _describe(invoice: BillingInvoice, count: int) -> str:
    """Назначение платежа в фактуре Stripe. Студия видит эту строку в письме и в
    выписке, поэтому виды постоплаты должны различаться явно."""
    if invoice.kind == "min_fee":
        return f"Velora: минимальный месячный платёж за {invoice.period}"
    if invoice.kind == "online_fee":
        # Формулировка обязана снять вопрос «почему счёт уже оплачен»: студия этих
        # денег не переводила, их удержал Stripe в момент платежа клиента.
        # Числа операций тут намеренно НЕТ: в досылке (_finish_pending) count
        # считается по строкам OfflineTransactionFee, которых у онлайна не бывает,
        # и в фактуру уехало бы «0 операц.».
        return f"Velora: комиссия с онлайн-платежей за {invoice.period} (удержана при оплате)"
    return f"Velora: комиссия с офлайн-продаж, {count} операц."


async def _issue_to_stripe(
    db: AsyncSession, invoice: BillingInvoice, customer_id: str, description: str,
) -> None:
    """Выставить у Stripe уже зарезервированный локальный счёт.

    Две ветки, потому что деньги ходят по-разному:

    * `offline_fee` / `min_fee` — денег ещё нет, счёт их ПРОСИТ: письмо со ссылкой
      на оплату, срок, а по его истечении блокировка студии;
    * `online_fee` — деньги уже удержаны Stripe в момент платежа клиента, поэтому
      документ выпускается сразу ЗАКРЫТЫМ и оплату не просит. Выставить его как
      обычный счёт значило бы потребовать комиссию второй раз.
    """
    # `plan`/`period_months`/`kind` читает mirror_invoice в вебхуке — без них
    # он затрёт наш маркер именем текущего тарифа студии.
    #
    # `invoice_id` — ссылка на ЭТУ строку. По ней вебхук находит её вместо того,
    # чтобы завести вторую (webhook._adopt_local_invoice): событие по счёту может
    # прилететь раньше, чем мы успеем записать stripe_invoice_id, и тогда наш
    # commit падал на уникальном индексе, а `_finish_pending` выпускал студии
    # второй документ за тот же месяц. Для `online_fee` это не гипотеза —
    # `create_settled_invoice` сама закрывает счёт, и `invoice.paid` вылетает
    # ровно между вызовом и коммитом.
    metadata = {
        "studio_id": str(invoice.studio_id),
        "plan": invoice.kind,
        "period_months": "1",
        "kind": invoice.kind,
        "period": invoice.period or "",
        "invoice_id": str(invoice.id),
    }
    # Налог решаем ОДИН раз на документ и тем же входом, что и оплата тарифа:
    # разные решения по одной студии в один месяц — это счёт с налогом и фактура
    # без него у одного плательщика.
    tax = await billing_tax.application(db, invoice.studio_id, invoice.kind)
    await billing_tax.sync_customer_exempt(customer_id, tax)
    snapshot = billing_tax.snapshot(tax, invoice.amount, stripe_billing.CURRENCY)
    for field, value in snapshot.items():
        setattr(invoice, field, value)

    if invoice.kind == "online_fee":
        # ОТДЕЛЬНОЕ ФИНАНСОВОЕ РЕШЕНИЕ, а не ошибка кода. Свою долю Stripe удержал в
        # момент платежа клиента — это НЕТТО. Если сверху начисляется налог, документ
        # объявляет полученной сумму БОЛЬШЕ удержанной, а `paid_out_of_band` говорит
        # «эти деньги уже у нас». Про налоговую часть это неправда.
        #
        # Чинить догадкой нельзя ни в одну сторону: уменьшить комиссию — значит молча
        # изменить цену услуги, увеличить удержание — значит списать со студии деньги,
        # о которых с ней не договаривались. Поэтому расхождение ГРОМКО показывается и
        # выносится владельцу, а документ выпускается как прежде: это поведение
        # существовало и при автоматическом расчёте Stripe, и менять его молча —
        # ровно та самая догадка.
        if snapshot.get("tax_amount"):
            logger.error(
                "Онлайн-комиссия: студия %s, фактура за %s — удержано %s %s (нетто), "
                "а документ объявляет оплаченными %s %s с налогом %s. Расхождение "
                "нетто/брутто требует решения владельца: пересмотреть ставку комиссии "
                "или порядок удержания",
                invoice.studio_id, invoice.period, invoice.amount,
                stripe_billing.CURRENCY, invoice.amount + snapshot["tax_amount"],
                stripe_billing.CURRENCY, snapshot["tax_amount"],
            )
        stripe_invoice = await stripe_billing.create_settled_invoice(
            customer_id=customer_id,
            amount=invoice.amount,
            currency=stripe_billing.CURRENCY,
            description=description,
            metadata=metadata,
            tax=tax,
        )
        # Локальную строку закрываем здесь же. Событие `invoice.paid` по этому
        # счёту придёт следом, но apply_status на уже закрытом счёте выходит
        # сразу (идемпотентность по статусу) — второй записи дохода не будет.
        invoice.status = "paid"
        invoice.paid_at = datetime.utcnow()
        # Срок оплаты бессмыслен у оплаченного счёта, а непустой due_at в прошлом
        # — это то, по чему platform_fee.suspension_reason блокирует студию.
        invoice.due_at = None
    else:
        stripe_invoice = await stripe_billing.create_fee_invoice(
            customer_id=customer_id,
            amount=invoice.amount,
            currency=stripe_billing.CURRENCY,
            description=description,
            days_until_due=GRACE_DAYS,
            metadata=metadata,
            tax=tax,
        )
        # Срок — ТОЛЬКО здесь, и только после того, как счёт реально выдан. Строка
        # создаётся с пустым due_at (см. `_bill`), а `suspension_reason` блокирует
        # исключительно по непустому сроку в прошлом: пока Stripe счёт не принял,
        # блокировать не за что. Ставим МЫ и в БД, а не читаем из ответа Stripe:
        # блокировка не должна зависеть от того, как он посчитал свой due date.
        #
        # Отсчёт от текущего момента заодно перезапускает часы на каждой удачной
        # досылке (_finish_pending): студия не теряет grace-период из-за того, что
        # выдать счёт вовремя не получилось у нас.
        invoice.due_at = datetime.utcnow() + timedelta(days=GRACE_DAYS)
    invoice.stripe_invoice_id = stripe_invoice.id
    invoice.hosted_invoice_url = getattr(stripe_invoice, "hosted_invoice_url", None)
    invoice.pdf_url = getattr(stripe_invoice, "invoice_pdf", None)
    await db.commit()
    logger.info(
        "Офлайн-комиссии: студии %s выставлен счёт %s на %s %s до %s",
        invoice.studio_id, stripe_invoice.id, invoice.amount,
        stripe_billing.CURRENCY, invoice.due_at,
    )


async def _month_platform_revenue(
    db: AsyncSession, studio_id: int, start: datetime, end: datetime,
) -> int:
    """Сколько платформа заработала на студии за [start, end) — в валюте биллинга.

    Два источника, потому что деньги приходят по-разному:

    * онлайн — долю удержал сам Stripe в момент платежа (`application_fee_amount`),
      и она уже лежит строкой в леджере (source="connect_fee");
    * офлайн — доля НАЧИСЛЕНА строкой OfflineTransactionFee и будет выставлена
      счётом. Считаем по дате начисления, а не по дате оплаты счёта: счёт за месяц
      выставляется уже в следующем, и по оплате выручка закрытого месяца всегда
      выглядела бы нулевой.

    Строки леджера с source="offline_fee"/"min_fee" сюда НЕ берём — это те же
    офлайн-деньги, уже посчитанные начислениями, и минимальный платёж прошлого
    месяца, который не должен закрывать минимум следующего.
    """
    total = 0

    online = (await db.execute(
        select(PlatformRevenueLedger.currency, func.sum(PlatformRevenueLedger.amount))
        .where(
            PlatformRevenueLedger.studio_id == studio_id,
            PlatformRevenueLedger.source == "connect_fee",
            PlatformRevenueLedger.occurred_at >= start,
            PlatformRevenueLedger.occurred_at < end,
        )
        .group_by(PlatformRevenueLedger.currency)
    )).all()

    offline = (await db.execute(
        select(OfflineTransactionFee.currency, func.sum(OfflineTransactionFee.fee_amount))
        .where(
            OfflineTransactionFee.studio_id == studio_id,
            OfflineTransactionFee.created_at >= start,
            OfflineTransactionFee.created_at < end,
        )
        .group_by(OfflineTransactionFee.currency)
    )).all()

    for currency, amount in (*online, *offline):
        converted = to_billing_currency(int(amount or 0), currency)
        if converted is None:
            # Курса нет — считаем выручку ЗАНИЖЕННОЙ, и студия рискует получить
            # счёт на минимум там, где заработала достаточно. Поэтому громко.
            logger.error(
                "Минимальный платёж: нет курса %s→%s, выручка студии %s за %s посчитана неполно",
                currency, stripe_billing.CURRENCY, studio_id, period_label(start),
            )
            continue
        total += converted
    return total


async def _bill_minimum(
    db: AsyncSession, studio_id: int, start: datetime, end: datetime,
) -> BillingInvoice | None:
    """Счёт на разницу до минимального месячного платежа. None — платить нечего.

    Только для тарифа «только процент»: там платформа зарабатывает исключительно с
    оборота, и месяц без продаж означал бы бесплатную CRM. У «комбо» фиксированная
    часть уже берётся подпиской, у чистой подписки — тем более, поэтому им минимум
    не выставляется.

    Считаем РАЗНИЦУ, а не полную сумму: заработали 12 € — счёт на 27 €, заработали
    больше минимума — счёта нет вовсе. Порог «строго ноль» обходился бы одной
    продажей на 10 €.

    Повторно за тот же месяц выставить нельзя: `period` уникален в паре
    (studio_id, kind) — см. uq_billing_invoice_period. Проверка ниже нужна, чтобы
    не ходить в Stripe зря, а гарантию даёт индекс.
    """
    # Импорт локальный: routers.billing.plans тянет за собой routers.billing.__init__,
    # а тот — router.py, который импортирует ЭТОТ модуль. На уровне файла вышел бы
    # цикл (тот же приём, что в dependencies.py и billing/webhook.py).
    from routers.billing.plans import MIN_MONTHLY_FEE

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if plan is None or plan.billing_mode != "percent":
        return None

    # Минимум берётся за МЕСЯЦ, ПРОВЕДЁННЫЙ НА ПРОЦЕНТЕ, а не за месяц, в котором
    # студия на процент перешла. Проверка `billing_mode` выше говорит только о том,
    # что творится СЕЙЧАС: проход берёт всех, кто на проценте В МОМЕНТ ПРОХОДА, и
    # выставляет им счёт за ЗАКРЫТЫЙ месяц. Студия, переключившаяся 14 августа,
    # получала 39 € за ИЮЛЬ — месяц, который она целиком провела на подписке и уже
    # оплатила. Живая жалоба 14.08.2026: «за что 39 €, я просто нажал кнопку».
    #
    # Отсчёт — от согласия на постоплату (`percent_terms_accepted_at`): его ставит
    # ровно тот запрос, который включает процент (router.activate_model), другого
    # входа на этот тариф нет. Неполный первый месяц не добираем СОЗНАТЕЛЬНО:
    # делить минимум по дням ради одного месяца — арифметика, которую потом
    # придётся объяснять в каждом споре, а ошибка в пользу студии здесь дешевле.
    since = plan.percent_terms_accepted_at
    if since is None or since >= start:
        logger.info(
            "Минимальный платёж: студия %s на проценте с %s — за %s не выставляем",
            studio_id, since, period_label(start),
        )
        return None

    period = period_label(start)
    existing = (await db.execute(
        select(BillingInvoice.id).where(
            BillingInvoice.studio_id == studio_id,
            BillingInvoice.kind == "min_fee",
            BillingInvoice.period == period,
        )
    )).first()
    if existing is not None:
        return None

    await _refresh_fx(db)
    shortfall = MIN_MONTHLY_FEE - await _month_platform_revenue(db, studio_id, start, end)
    if shortfall < MIN_INVOICE_AMOUNT:
        return None

    customer_id = await _ensure_studio_customer(db, plan)
    if customer_id is None:
        logger.error(
            "Минимальный платёж: у студии %s нет Stripe Customer — счёт на %s за %s не выставлен",
            studio_id, shortfall, period,
        )
        return None

    invoice = BillingInvoice(
        studio_id=studio_id,
        plan_name="min_fee",
        kind="min_fee",
        period=period,
        period_months=1,
        amount=shortfall,
        status="pending",
        payment_method="invoice",
        # Срок ставит выдача (_issue_to_stripe), как и у счёта за комиссию: тот же
        # grace, та же причина не проставлять его заранее (см. `_bill`).
        due_at=None,
    )
    db.add(invoice)
    await db.commit()

    await _issue_to_stripe(db, invoice, customer_id, _describe(invoice, 0))
    logger.info(
        "Минимальный платёж: студии %s выставлен счёт на %s за %s",
        studio_id, shortfall, period,
    )
    return invoice


async def _bill_online_fees(
    db: AsyncSession, studio_id: int, start: datetime, end: datetime,
) -> BillingInvoice | None:
    """Фактура за онлайн-комиссию закрытого месяца. None — выставлять нечего.

    Деньги УЖЕ у платформы: Stripe удержал долю в момент платежа клиента
    (`application_fee_amount`) и записал строку леджера `connect_fee`. Здесь не
    взыскание, а ВЫПУСК ДОКУМЕНТА на уже полученное — счёт создаётся сразу
    закрытым (services/stripe_billing.create_settled_invoice).

    Без него дыра была с обеих сторон: студия на «проценте» платила комиссию и не
    могла списать её в расход, а у платформы не было фактуры на собственный доход.
    Офлайн-комиссии документ имели всегда, онлайновые — ни одного.

    Источник сумм — леджер, а не начисления: офлайн копится строками
    OfflineTransactionFee, а онлайн в них не попадает вовсе.

    Повторно за тот же месяц выставить нельзя: `period` уникален в паре
    (studio_id, kind) — uq_billing_invoice_period. Проверка ниже нужна, чтобы не
    ходить в Stripe зря, а гарантию даёт индекс.
    """
    period = period_label(start)
    existing = (await db.execute(
        select(BillingInvoice.id).where(
            BillingInvoice.studio_id == studio_id,
            BillingInvoice.kind == "online_fee",
            BillingInvoice.period == period,
        )
    )).first()
    if existing is not None:
        return None

    rows = (await db.execute(
        select(
            PlatformRevenueLedger.currency,
            func.sum(PlatformRevenueLedger.amount),
            func.count(),
        )
        .where(
            PlatformRevenueLedger.studio_id == studio_id,
            PlatformRevenueLedger.source == "connect_fee",
            PlatformRevenueLedger.occurred_at >= start,
            PlatformRevenueLedger.occurred_at < end,
        )
        .group_by(PlatformRevenueLedger.currency)
    )).all()
    if not rows:
        return None

    await _refresh_fx(db)
    total, count = 0, 0
    for currency, amount, entries in rows:
        converted = to_billing_currency(int(amount or 0), currency)
        if converted is None:
            # Молча недосчитать документ хуже, чем его отложить: студия получила бы
            # фактуру на сумму меньше удержанной, и та не сошлась бы с выпиской.
            logger.error(
                "Онлайн-комиссия: нет курса %s→%s, фактура студии %s за %s не выставлена",
                currency, stripe_billing.CURRENCY, studio_id, period,
            )
            return None
        total += converted
        count += int(entries or 0)

    if total < MIN_INVOICE_AMOUNT:
        return None

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    customer_id = await _ensure_studio_customer(db, plan) if plan is not None else None
    if customer_id is None:
        logger.error(
            "Онлайн-комиссия: у студии %s нет Stripe Customer — фактура на %s за %s не выставлена",
            studio_id, total, period,
        )
        return None

    invoice = BillingInvoice(
        studio_id=studio_id,
        plan_name="online_fee",
        kind="online_fee",
        period=period,
        period_months=1,
        amount=total,
        # pending до похода в Stripe: закрытым его пометит _issue_to_stripe, когда
        # документ реально выпущен. Упади вызов — счёт подберёт _finish_pending.
        status="pending",
        payment_method="stripe",
        # due_at пуст намеренно: заполненный срок в прошлом — это ровно то, по чему
        # platform_fee.suspension_reason блокирует студию, а тут платить нечего.
        due_at=None,
    )
    db.add(invoice)
    await db.commit()

    await _issue_to_stripe(db, invoice, customer_id, _describe(invoice, count))
    logger.info(
        "Онлайн-комиссия: студии %s выпущена фактура на %s за %s (%s операц.)",
        studio_id, total, period, count,
    )
    return invoice


async def _finish_pending(db: AsyncSession) -> int:
    """Дослать в Stripe счета, зарезервированные локально, но не выставленные.

    Без этого прохода начисления навсегда остались бы помеченными выставленными,
    а денег бы никто не попросил — и студия при этом была бы заблокирована по
    `due_at` за счёт, которого никогда не видела.
    """
    # Идентификаторами, а НЕ сущностями. Ниже в цикле есть откат, а
    # `Session.rollback()` обесценивает весь identity map безусловно:
    # `expire_on_commit=False` касается только коммита. Держи мы тут ORM-объекты,
    # первый же сбой превращал бы `invoice.id` в обработчике — и
    # `invoice.studio_id` на следующем витке — в поход за SELECT'ом, которого
    # синхронный доступ к атрибуту в async-сессии сделать не может
    # (MissingGreenlet). Досылку уносило целиком, вместе с настоящей причиной
    # сбоя: обработчик падал раньше, чем успевал её записать. Тот же приём, что в
    # daily_notify.run_daily_notify и scenario_runner.run_due_scenarios.
    pending_ids = (await db.execute(
        select(BillingInvoice.id).where(
            BillingInvoice.kind.in_(("offline_fee", "min_fee", "online_fee")),
            BillingInvoice.stripe_invoice_id.is_(None),
            BillingInvoice.status == "pending",
        )
    )).scalars().all()

    done = 0
    for invoice_id in pending_ids:
        # Перечитываем на каждом витке: предыдущий откат мог обесценить строку, и
        # это законный await, в отличие от обращения к полю.
        invoice = await db.get(BillingInvoice, invoice_id)
        if invoice is None:
            continue
        plan = (await db.execute(
            select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
        )).scalar_one_or_none()
        if plan is None:
            continue
        customer_id = await _ensure_studio_customer(db, plan)
        if customer_id is None:
            continue
        count = (await db.execute(
            select(func.count()).select_from(OfflineTransactionFee)
            .where(OfflineTransactionFee.invoice_id == invoice.id)
        )).scalar() or 0
        try:
            # Срок ставит сама выдача и отсчитывает его заново от этого момента
            # (_issue_to_stripe): студия не должна терять grace-период из-за того,
            # что у нас не получилось выставить счёт вовремя. Здесь его трогать
            # нельзя — упавшая выдача оставила бы срок на строке, которую студия
            # так и не увидела.
            await _issue_to_stripe(db, invoice, customer_id, _describe(invoice, count))
            done += 1
        except Exception:
            await db.rollback()
            # invoice_id, а не invoice.id: строку только что обесценил откат.
            logger.exception("Офлайн-комиссии: недовыставленный счёт %s не дослан", invoice_id)
    return done


async def bill_now(db: AsyncSession, studio_id: int) -> BillingInvoice | None:
    """Выставить счёт немедленно — кнопка «Оплатить» в «Тариф и оплата».

    Берёт ВСЁ невыставленное, включая текущий месяц: студия сама решила
    рассчитаться досрочно. Уже выставленный неоплаченный счёт при этом не
    трогаем — вызывающий сначала отдаёт его.
    """
    return await _bill(db, studio_id, cutoff=None)


async def _send_reminders(db: AsyncSession) -> int:
    """Письмо-предупреждение по счетам, которым до блокировки осталось REMINDER_DAYS.

    Раньше о скором отключении напоминало только письмо Stripe по счёту — своего
    предупреждения в CRM не было. Шлётся один раз на счёт: reminder_sent_at
    ставится только при успешной отправке, иначе следующий тик повторит попытку
    (тот же принцип, что у `_finish_pending`) — молчание SMTP на пару часов не
    должно навсегда лишить студию предупреждения.
    """
    now = datetime.utcnow()
    invoices = (await db.execute(
        select(BillingInvoice).where(
            BillingInvoice.kind == "offline_fee",
            BillingInvoice.status == "pending",
            BillingInvoice.reminder_sent_at.is_(None),
            BillingInvoice.due_at.isnot(None),
            BillingInvoice.due_at > now,
            BillingInvoice.due_at <= now + timedelta(days=REMINDER_DAYS),
        )
    )).scalars().all()
    if not invoices:
        return 0

    from services.billing_mail import send_block_warning

    sent = 0
    for invoice in invoices:
        if await send_block_warning(db, invoice):
            invoice.reminder_sent_at = now
            sent += 1
    if sent:
        await db.commit()
    return sent


async def run_offline_fee_billing(session_maker: async_sessionmaker) -> int:
    """Выставить счета всем студиям с долгом за прошлые месяцы. Вернуть их число.

    Проход целиком под advisory-локом Postgres: воркеров может быть несколько, а
    `with_for_update` в `_bill` закрывает гонку только внутри одной транзакции —
    между «зарезервировали начисления» и «выставили счёт у Stripe» коммит уже
    прошёл, и второй инстанс успел бы завести студии второй счёт за тот же месяц.
    Лок держится на соединении и снимается сам, если процесс умрёт.
    """
    if not stripe_billing.configured():
        return 0

    async with session_maker() as guard:
        # Соединение под этой сессией держится до выхода из блока — на нём и
        # живёт лок. Коммитить/откатывать guard нельзя: соединение вернётся в
        # пул, и лок снимется посреди работы.
        acquired = (await guard.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": _LOCK_KEY},
        )).scalar()
        if not acquired:
            logger.info("Офлайн-комиссии: проход уже идёт в другом процессе, пропускаем")
            return 0
        try:
            return await _run_billing_pass(session_maker)
        finally:
            await guard.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _LOCK_KEY})


async def _run_billing_pass(session_maker: async_sessionmaker) -> int:
    """Тело прохода. Отдельно от run_offline_fee_billing, чтобы лок оборачивал
    его целиком одним `try/finally`, а не размазывался по шагам."""
    # Курс освежаем КАЖДЫЙ проход (внутри TTL это no-op, то есть раз в сутки), а не
    # только в момент выставления счёта: по нему считает и виджет «Комиссия с
    # офлайн-продаж», а он читает курс из БД и своего похода в сеть не делает.
    async with session_maker() as db:
        await _refresh_fx(db)

    async with session_maker() as db:
        try:
            await _finish_pending(db)
        except Exception:
            await db.rollback()
            logger.exception("Офлайн-комиссии: досылка недовыставленных счетов упала")

    async with session_maker() as db:
        try:
            await _send_reminders(db)
        except Exception:
            await db.rollback()
            logger.exception("Офлайн-комиссии: напоминания о блокировке не отправлены")

    # Автосверка подписок со Stripe — в этом же проходе, а не отдельной петлёй: он
    # уже ходит раз в час и уже взят под advisory-лок, то есть работает ровно в
    # одном процессе кластера. Второй таск ради трёх запросов не нужен.
    #
    # Импорт локальный — routers.billing.webhook тянет routers.billing.plans, а тот
    # через пакет — router.py, который импортирует ЭТОТ модуль (тот же цикл, что у
    # _bill_minimum выше).
    async with session_maker() as db:
        try:
            from routers.billing.webhook import reconcile_subscriptions

            if await reconcile_subscriptions(db):
                logger.warning("Автосверка: состояние подписок разъезжалось со Stripe — исправлено")
        except Exception:
            await db.rollback()
            logger.exception("Автосверка подписок со Stripe не выполнена")

    # Налог на подписках — здесь же и по той же причине. Это ГЛАВНЫЙ механизм
    # правильного налога на автопродлении: счёт очередного периода Stripe собирает
    # сам, из состояния подписки, и нашего кода в тот момент рядом нет. Значит
    # состояние подписки обязано быть верным ЗАРАНЕЕ, а не чиниться вебхуком по
    # факту — вебхук может не дойти, а счёт всё равно выставится.
    async with session_maker() as db:
        try:
            from routers.billing.webhook import sync_subscription_taxes

            if await sync_subscription_taxes(db):
                logger.info("Налог: налоговые настройки подписок обновлены")
        except Exception:
            await db.rollback()
            logger.exception("Налог: синхронизация подписок не выполнена")

    # Сверка ОПЛАТ КЛИЕНТОВ студий (Connect) — сюда же, и это не мелочь в общей
    # куче. Покупка абонемента в мини-приложении проводится ТОЛЬКО вебхуком: ни
    # кнопки «подтвердить», ни кассира у клиента нет. Потерянное событие означало
    # «деньги на счету студии, абонемента нет», и обнаруживалось это по жалобе.
    # Теперь застрявшая заявка перепроверяется у Stripe тем же путём проведения,
    # что и вебхук (общий apply_paid под блокировкой строки).
    async with session_maker() as db:
        try:
            from routers.checkout.stripe_pay import reconcile_pending

            applied = await reconcile_pending(db)
            if applied:
                logger.warning(
                    "Сверка оплат: проведено %s оплат, по которым не дошёл вебхук", applied,
                )
        except Exception:
            await db.rollback()
            logger.exception("Сверка оплат клиентов не выполнена")

    # Досверка номеров НДС, принятых при молчащем реестре ЕС, — сюда же и по той же
    # причине: раз в час, в одном процессе, под тем же локом. До неё плательщик
    # платит полный НДС вместо reverse charge, так что тянуть с ней нельзя.
    async with session_maker() as db:
        try:
            from routers.billing.webhook import recheck_vat_numbers

            if await recheck_vat_numbers(db):
                logger.info("VIES: неподтверждённые номера НДС досверены")
        except Exception:
            await db.rollback()
            logger.exception("VIES: досверка номеров НДС не выполнена")

    cutoff = month_start(datetime.utcnow())
    closed_month = prev_month_start(cutoff)
    period = period_label(closed_month)

    async with session_maker() as db:
        studio_ids = (await db.execute(
            select(OfflineTransactionFee.studio_id)
            .where(
                OfflineTransactionFee.invoice_id.is_(None),
                OfflineTransactionFee.created_at < cutoff,
            )
            .group_by(OfflineTransactionFee.studio_id)
        )).scalars().all()

    billed = 0
    for studio_id in studio_ids:
        # Своя сессия на студию: упавший счёт одной не должен отменять уже
        # выставленные другим (Stripe-объект при откате транзакции не исчезнет).
        async with session_maker() as db:
            try:
                if await _bill(db, studio_id, cutoff, period) is not None:
                    billed += 1
            except Exception:
                await db.rollback()
                logger.exception("Офлайн-комиссии: счёт студии %s не выставлен", studio_id)

    # Минимальный платёж — ОТДЕЛЬНЫМ проходом и по ВСЕМ percent-студиям, а не
    # только по тем, у кого есть начисления: студия без единой продажи в список
    # выше не попадает вовсе, а именно она и есть адресат минимума.
    #
    # Строго после счетов за комиссию: выручка закрытого месяца считается по
    # начислениям, и порядок на неё не влияет, но так в логах пара «комиссия →
    # добор до минимума» идёт по одной студии подряд.
    async with session_maker() as db:
        percent_studio_ids = (await db.execute(
            select(StudioBillingPlan.studio_id)
            .where(StudioBillingPlan.billing_mode == "percent")
        )).scalars().all()

    for studio_id in percent_studio_ids:
        async with session_maker() as db:
            try:
                if await _bill_minimum(db, studio_id, closed_month, cutoff) is not None:
                    billed += 1
            except Exception:
                await db.rollback()
                logger.exception("Минимальный платёж: счёт студии %s не выставлен", studio_id)

    # Фактуры за онлайн-комиссию закрытого месяца. Отдельным проходом и по СВОЕМУ
    # списку студий: онлайн-доля не попадает в OfflineTransactionFee вовсе, она
    # лежит строками леджера — студия с одними онлайн-платежами в оба списка выше
    # не входит, а документ ей нужен ровно так же.
    async with session_maker() as db:
        online_studio_ids = (await db.execute(
            select(PlatformRevenueLedger.studio_id)
            .where(
                PlatformRevenueLedger.source == "connect_fee",
                PlatformRevenueLedger.occurred_at >= closed_month,
                PlatformRevenueLedger.occurred_at < cutoff,
            )
            .group_by(PlatformRevenueLedger.studio_id)
        )).scalars().all()

    for studio_id in online_studio_ids:
        async with session_maker() as db:
            try:
                invoice = await _bill_online_fees(db, studio_id, closed_month, cutoff)
            except Exception:
                await db.rollback()
                logger.exception("Онлайн-комиссия: фактура студии %s не выставлена", studio_id)
                continue
            if invoice is not None:
                billed += 1
                # Копия платформе — то самое «присылать и мне». Своим вызовом и
                # после коммита: упавшая почта не повод откатывать выпущенный
                # документ (send_platform_income глотает свои ошибки сам).
                from services.billing_mail import send_platform_income

                await send_platform_income(db, invoice)
    return billed


async def _loop(session_maker: async_sessionmaker) -> None:
    while True:
        try:
            await run_offline_fee_billing(session_maker)
        except Exception:
            logger.exception("offline_fee_billing loop iteration failed")
        await asyncio.sleep(_SLEEP_SECONDS)


def start_offline_fee_billing_loop(session_maker: async_sessionmaker) -> asyncio.Task:
    """Запустить фоновый таск. Возвращает Task, чтобы lifespan мог его отменить.

    Петля запускается в каждом процессе, но работу делает одна: проход берёт
    advisory-лок Postgres (см. run_offline_fee_billing), остальные тихо уходят
    до следующего тика.
    """
    return asyncio.create_task(_loop(session_maker))


if __name__ == "__main__":
    from types import SimpleNamespace

    # Граница месяца: биллим прошлое, текущий месяц продолжает копиться.
    assert month_start(datetime(2026, 8, 8, 14, 30, 5)) == datetime(2026, 8, 1)
    assert month_start(datetime(2026, 1, 1, 0, 0, 0)) == datetime(2026, 1, 1)
    assert month_start(datetime(2026, 12, 31, 23, 59)) == datetime(2026, 12, 1)

    # Валюта биллинга проходит как есть.
    _saved_fx = dict(_FX)
    _FX.clear()
    assert to_billing_currency(4500, stripe_billing.CURRENCY) == 4500
    assert to_billing_currency(4500, stripe_billing.CURRENCY.upper()) == 4500
    # Чужая валюта без курса — None («не выставлять»), а НЕ 0 («выставить ноль»).
    assert to_billing_currency(4500, "czk") is None
    _FX["czk"] = 0.04
    assert to_billing_currency(4500, "czk") == 180
    assert to_billing_currency(4500, "CZK") == 180
    _FX.clear()
    _FX.update(_saved_fx)

    # Неделя на оплату — ровно то, на что студия соглашается в модалке.
    assert GRACE_DAYS == 7
    # Предупреждение обязано прийти ДО блокировки, не после и не в день блокировки.
    assert 0 < REMINDER_DAYS < GRACE_DAYS

    # Ключ лока обязан влезать в bigint Postgres и быть константой.
    assert 0 < _LOCK_KEY < 2 ** 63

    # Курс переживает перезапуск процесса: память пуста — поднимаем из БД.
    # Именно это и просили: последний записанный курс остаётся в ходу, пока
    # провайдер недоступен, сколько бы это ни длилось.
    class _FxDB:
        """Сессия-заглушка: отдаёт одну строку курса и считает коммиты."""

        def __init__(self, rows):
            self.rows, self.commits = rows, 0

        async def execute(self, _q):
            return SimpleNamespace(all=lambda: self.rows)

        async def commit(self):
            self.commits += 1

        async def rollback(self):
            pass

    _FX.clear()
    asyncio.run(_load_fx(_FxDB([("czk", 0.04)])))
    assert _FX["czk"] == 0.04, "курс не поднялся из БД"
    assert to_billing_currency(4500, "czk") == 180

    # Пустая таблица — это «курса нет», а не ноль: считать по нему значило бы
    # молча недобрать комиссию (см. to_billing_currency).
    _FX.clear()
    asyncio.run(_load_fx(_FxDB([])))
    assert to_billing_currency(4500, "czk") is None

    # Сбой чтения БД не роняет проход: курса просто нет, счёт отложится.
    class _BrokenDB:
        async def execute(self, _q):
            raise RuntimeError("БД прилегла")

    _FX.clear()
    asyncio.run(_load_fx(_BrokenDB()))
    assert not _FX

    # Запись идёт UPSERT'ом по каждой валюте и одним коммитом на проход.
    _FX.clear()
    _FX.update({"czk": 0.04, "pln": 0.23})
    _writer = _FxDB([])
    asyncio.run(_save_fx(_writer))
    assert _writer.commits == 1

    # Два источника курса: ЕЦБ главный, второй только дозаполняет то, чего у ЕЦБ
    # нет (UAH/RUB/KZT). Перебить курс ЕЦБ он не имеет права — иначе евро-фактура
    # считалась бы не по эталонному курсу.
    _real_fetch = _fetch_rates

    async def _fake_fetch(url):
        return {"czk": 0.04} if url.startswith(_FX_URL) else {"czk": 0.99, "uah": 0.02}

    _FX.clear()
    _fetch_rates = _fake_fetch  # noqa: F811 — подмена на время self-check
    _fx_fetched_at = None
    asyncio.run(_refresh_fx(_FxDB([])))
    assert _FX["czk"] == 0.04, "второй источник перебил ЕЦБ"
    assert _FX["uah"] == 0.02, "валюта, которой нет у ЕЦБ, не дозаполнилась"
    _fetch_rates = _real_fetch

    _FX.clear()
    _FX.update(_saved_fx)

    print("offline_fee_billing self-check ok")
