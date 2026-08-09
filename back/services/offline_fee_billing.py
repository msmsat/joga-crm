"""Счёт студии за комиссию с офлайн-продаж — постоплата без привязанной карты.

Онлайн-платёж расщепляет сам Stripe в момент оплаты (`application_fee_amount`),
а наличные, терминал и депозит проходят мимо платформы: её доля копится строками
`OfflineTransactionFee` и выставляется одним счётом.

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
import json
import logging
import os
import tempfile
from datetime import datetime, timedelta

import aiohttp
from sqlalchemy import func, text
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from models import BillingInvoice, OfflineTransactionFee, StudioBillingPlan
from services import stripe_billing

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
# Раньше курс был статичной строкой в .env (BILLING_FX), правилась руками и
# неизбежно расходилась с реальным. Теперь тянется с ECB (frankfurter.dev), раз
# в сутки, кэш живёт в памяти процесса — см. _refresh_fx.
_FX: dict[str, float] = {}
_fx_fetched_at: datetime | None = None
_FX_URL = "https://api.frankfurter.dev/v1/latest"
_FX_TTL = timedelta(hours=24)

# Последний УДАЧНО полученный курс на диске: кэш в памяти умирает вместе с
# процессом, и холодный старт при недоступном провайдере остался бы вообще без
# курса — все начисления в чужой валюте отложились бы до следующего тика.
#
# ponytail: файл, а не таблица. Это кэш, а не бизнес-данные: потеря стоит одного
# похода к провайдеру. В контейнере с эфемерной ФС задайте FX_CACHE_PATH на
# примонтированный том; понадобится общий кэш на несколько инстансов — тогда БД.
_FX_CACHE_PATH = os.getenv("FX_CACHE_PATH") or os.path.join(tempfile.gettempdir(), "velora_fx.json")


def _load_fx_cache() -> None:
    """Поднять сохранённый курс с диска. Молча, любой сбой = «кэша нет»."""
    try:
        with open(_FX_CACHE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return
    # Курсы сохранены ОТНОСИТЕЛЬНО валюты биллинга. Сменили BILLING_CURRENCY —
    # старый файл говорит о других деньгах, и применить его значит выставить
    # счета с множителем от прошлой валюты.
    if data.get("base") != stripe_billing.CURRENCY:
        return
    rates = data.get("rates")
    if isinstance(rates, dict):
        _FX.update({str(code).lower(): float(rate) for code, rate in rates.items() if rate})
        logger.info("Офлайн-комиссии: курс поднят из кэша %s (%s валют)", _FX_CACHE_PATH, len(_FX))


def _save_fx_cache() -> None:
    """Сохранить свежий курс. Сбой записи не повод ронять биллинг."""
    try:
        with open(_FX_CACHE_PATH, "w", encoding="utf-8") as fh:
            json.dump({"base": stripe_billing.CURRENCY, "rates": _FX}, fh)
    except OSError:
        logger.exception("Офлайн-комиссии: курс не сохранён в %s", _FX_CACHE_PATH)


async def _refresh_fx() -> None:
    """Обновить курсы у ECB, если кэш старше суток. Молчит и не роняет биллинг.

    Сбой запроса НЕ чистит кэш: вчерашний курс безопаснее полного отказа считать —
    иначе to_billing_currency вернула бы None на все офлайн-начисления, пока
    провайдер недоступен, и они зависли бы неучтёнными до следующего тика.
    Пустой кэш (холодный старт) поднимаем с диска — там лежит последний удачный.
    """
    global _fx_fetched_at
    if not _FX:
        _load_fx_cache()
    if _fx_fetched_at is not None and datetime.utcnow() - _fx_fetched_at < _FX_TTL:
        return
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(
                _FX_URL, params={"base": stripe_billing.CURRENCY.upper()},
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
        rates = data.get("rates") or {}
        _FX.update({code.lower(): 1 / rate for code, rate in rates.items() if rate})
        _fx_fetched_at = datetime.utcnow()
        _save_fx_cache()
    except Exception:
        logger.exception("Офлайн-комиссии: курс валют с %s не получен, используется прошлый кэш", _FX_URL)

# Ниже этой суммы (в младших единицах валюты биллинга) счёт не выставляем: Stripe
# отвергает платёж меньше минимального, а банковская комиссия съест остаток. Долг
# не пропадает — строки остаются неоплаченными и уедут в следующий счёт.
MIN_INVOICE_AMOUNT = 100


def month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


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


async def _bill(db: AsyncSession, studio_id: int, cutoff: datetime | None) -> BillingInvoice | None:
    """Один счёт за все невыставленные начисления студии (до `cutoff`, если задан).

    `cutoff=None` — «выставить всё прямо сейчас», кнопка досрочной оплаты.

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
    await _refresh_fx()

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
    if plan is None or not plan.stripe_customer_id:
        logger.error(
            "Офлайн-комиссии: у студии %s нет Stripe Customer — счёт на %s не выставлен",
            studio_id, total,
        )
        return None

    invoice = BillingInvoice(
        studio_id=studio_id,
        plan_name="offline_fee",
        kind="offline_fee",
        period_months=1,
        amount=total,
        status="pending",
        payment_method="invoice",
        # Срок ставим МЫ и в БД: блокировка не должна зависеть от того, дошло ли
        # событие Stripe и как он посчитал свой due date.
        due_at=datetime.utcnow() + timedelta(days=GRACE_DAYS),
    )
    db.add(invoice)
    await db.flush()
    for fee in billable:
        fee.invoice_id = invoice.id
    await db.commit()

    await _issue_to_stripe(db, invoice, plan.stripe_customer_id, len(billable))
    return invoice


async def _issue_to_stripe(
    db: AsyncSession, invoice: BillingInvoice, customer_id: str, count: int,
) -> None:
    """Выставить у Stripe уже зарезервированный локальный счёт."""
    period = invoice.due_at.strftime("%Y-%m") if invoice.due_at else ""
    stripe_invoice = await stripe_billing.create_fee_invoice(
        customer_id=customer_id,
        amount=invoice.amount,
        currency=stripe_billing.CURRENCY,
        description=f"Velora: комиссия с офлайн-продаж, {count} операц.",
        days_until_due=GRACE_DAYS,
        # `plan`/`period_months`/`kind` читает mirror_invoice в вебхуке — без них
        # он затрёт наш маркер именем текущего тарифа студии.
        metadata={
            "studio_id": str(invoice.studio_id),
            "plan": "offline_fee",
            "period_months": "1",
            "kind": "offline_fee",
            "period": period,
        },
    )
    invoice.stripe_invoice_id = stripe_invoice.id
    invoice.hosted_invoice_url = getattr(stripe_invoice, "hosted_invoice_url", None)
    invoice.pdf_url = getattr(stripe_invoice, "invoice_pdf", None)
    await db.commit()
    logger.info(
        "Офлайн-комиссии: студии %s выставлен счёт %s на %s %s до %s",
        invoice.studio_id, stripe_invoice.id, invoice.amount,
        stripe_billing.CURRENCY, invoice.due_at,
    )


async def _finish_pending(db: AsyncSession) -> int:
    """Дослать в Stripe счета, зарезервированные локально, но не выставленные.

    Без этого прохода начисления навсегда остались бы помеченными выставленными,
    а денег бы никто не попросил — и студия при этом была бы заблокирована по
    `due_at` за счёт, которого никогда не видела.
    """
    pending = (await db.execute(
        select(BillingInvoice).where(
            BillingInvoice.kind == "offline_fee",
            BillingInvoice.stripe_invoice_id.is_(None),
            BillingInvoice.status == "pending",
        )
    )).scalars().all()

    done = 0
    for invoice in pending:
        plan = (await db.execute(
            select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
        )).scalar_one_or_none()
        if plan is None or not plan.stripe_customer_id:
            continue
        count = (await db.execute(
            select(func.count()).select_from(OfflineTransactionFee)
            .where(OfflineTransactionFee.invoice_id == invoice.id)
        )).scalar() or 0
        try:
            # Срок отсчитываем заново: студия не должна терять grace-период
            # из-за того, что у нас не получилось выставить счёт вовремя.
            invoice.due_at = datetime.utcnow() + timedelta(days=GRACE_DAYS)
            await _issue_to_stripe(db, invoice, plan.stripe_customer_id, count)
            done += 1
        except Exception:
            await db.rollback()
            logger.exception("Офлайн-комиссии: недовыставленный счёт %s не дослан", invoice.id)
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

    cutoff = month_start(datetime.utcnow())
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
                if await _bill(db, studio_id, cutoff) is not None:
                    billed += 1
            except Exception:
                await db.rollback()
                logger.exception("Офлайн-комиссии: счёт студии %s не выставлен", studio_id)
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

    # Кэш курса переживает перезапуск процесса: сохранили — очистили память —
    # подняли с диска. Именно это и просили: последний реальный курс остаётся
    # в ходу, пока провайдер недоступен.
    import shutil
    _saved_path = _FX_CACHE_PATH
    _tmp_dir = tempfile.mkdtemp()
    _FX_CACHE_PATH = os.path.join(_tmp_dir, "fx.json")
    try:
        _FX.clear()
        _FX["czk"] = 0.04
        _save_fx_cache()
        _FX.clear()
        assert to_billing_currency(4500, "czk") is None, "память не очистилась"
        _load_fx_cache()
        assert _FX["czk"] == 0.04
        assert to_billing_currency(4500, "czk") == 180

        # Сменили валюту биллинга — старый файл говорит о других деньгах и
        # применяться не должен, иначе счёт уедет с множителем от прошлой валюты.
        _FX.clear()
        _real_currency = stripe_billing.CURRENCY
        stripe_billing.CURRENCY = "usd"
        _load_fx_cache()
        assert not _FX, "кэш чужой базовой валюты применён"
        stripe_billing.CURRENCY = _real_currency

        # Битый и отсутствующий файл — просто «кэша нет», без исключения.
        with open(_FX_CACHE_PATH, "w", encoding="utf-8") as _fh:
            _fh.write("{не json")
        _load_fx_cache()
        assert not _FX
        _FX_CACHE_PATH = os.path.join(_tmp_dir, "missing.json")
        _load_fx_cache()
        assert not _FX
    finally:
        _FX_CACHE_PATH = _saved_path
        _FX.clear()
        _FX.update(_saved_fx)
        shutil.rmtree(_tmp_dir, ignore_errors=True)

    print("offline_fee_billing self-check ok")
