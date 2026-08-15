"""Чек об оплате тарифа Velora — письмом владельцу студии.

Зачем своё письмо, а не только квитанция Stripe: его рассылка чеков — галочка в
дашборде Stripe, а тумблер «Чек на email» в интерфейсе владельца обещает
управляемую отправку. Здесь она и живёт: одно письмо на переход счёта в paid, со
ссылкой на фактуру Stripe — официальный документ с суммой, налогом и IČO.

Отправка НЕ должна валить обработку платежа: тариф уже оплачен, и упавший SMTP не
повод отдать Stripe 500 и получить ретрай уже применённого события. Поэтому весь
модуль в try/except с логом, как notifier.

Запуск self-check:  python -m services.billing_mail
"""
import logging
import os

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import BillingInvoice, StudioBillingPlan, StudioMember, User
from models.studio import Studio
from services import stripe_billing
from services.email_layout import WEB_APP_URL, button, link
from services.mailer import send_email
from services.notifier import _CURRENCY_SIGNS, _studio_prefs

load_dotenv()

logger = logging.getLogger(__name__)

# Куда платформа получает уведомления о собственном доходе. Пусто — уведомления
# просто не шлются: отсутствие адреса не должно ронять обработку платежа.
PLATFORM_BILLING_EMAIL = os.getenv("PLATFORM_BILLING_EMAIL", "")

_SUBJECT = {
    "ru": "Velora — чек об оплате тарифа",
    "en": "Velora — subscription payment receipt",
}

_BILLING_PAGE = f"{WEB_APP_URL}/dashboard/billing"

# {plan}/{period}/{amount}/{method}/{link} подставляются ниже. Отдельный блок ссылки:
# у счёта может не быть ни PDF, ни хостед-страницы (событие пришло усечённым), и
# висящая пустая кнопка «Скачать фактуру» хуже её отсутствия.
_BODY = {
    "ru": (
        "<h2 style='font:800 22px/1.3 Arial,sans-serif;color:#1A1A1A;margin:0 0 14px'>Оплата получена</h2>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:0'>"
        "Тариф: <b style='color:#1A1A1A'>{plan}</b><br>"
        "Период: {period} мес.<br>"
        "Сумма: <b style='color:#1A1A1A'>{amount}</b><br>"
        "Способ оплаты: {method}</p>{link}"
        "<p style='font:400 13px/1.6 Arial,sans-serif;color:#999;margin:18px 0 0'>"
        "Счета и карта — в разделе " + link("Тариф и оплата", _BILLING_PAGE) +
        "; там же отключаются чеки на почту.</p>"
    ),
    "en": (
        "<h2 style='font:800 22px/1.3 Arial,sans-serif;color:#1A1A1A;margin:0 0 14px'>Payment received</h2>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:0'>"
        "Plan: <b style='color:#1A1A1A'>{plan}</b><br>"
        "Period: {period} months<br>"
        "Amount: <b style='color:#1A1A1A'>{amount}</b><br>"
        "Payment method: {method}</p>{link}"
        "<p style='font:400 13px/1.6 Arial,sans-serif;color:#999;margin:18px 0 0'>"
        "Invoices and your card live in " + link("Billing", _BILLING_PAGE) +
        " — receipts can be turned off there too.</p>"
    ),
}

_LINK = {
    "ru": button("Открыть фактуру", "{url}"),
    "en": button("View invoice", "{url}"),
}

_METHOD = {
    "ru": {"card": "банковская карта", "iban": "банковский перевод (IBAN)"},
    "en": {"card": "bank card", "iban": "bank transfer (IBAN)"},
}

# Подвал денежных писем со ссылками на Условия и Политику ставит общая оболочка
# писем (services/email_layout.wrap): условия, по которым списаны деньги, должны
# быть в шаге от письма о списании — но это верно для всех писем платформы, а не
# только для денежных, поэтому свой подвал здесь больше не собирается.

# Предупреждение о скором отключении за неоплаченный счёт комиссии (offline_fee).
# Раньше о нём напоминало только письмо Stripe по счёту — своего в CRM не было.
_WARN_SUBJECT = {
    "ru": "Velora — счёт за комиссию не оплачен, скоро отключение",
    "en": "Velora — unpaid fee invoice, access will be suspended soon",
}

_WARN_BODY = {
    "ru": (
        "<h2 style='font:800 22px/1.3 Arial,sans-serif;color:#1A1A1A;margin:0 0 14px'>Счёт за комиссию не оплачен</h2>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:0'>"
        "Сумма: <b style='color:#1A1A1A'>{amount}</b><br>"
        "Оплатить до: <b style='color:#1A1A1A'>{due}</b></p>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:14px 0 0'>"
        "Если счёт не будет оплачен в срок, доступ к CRM и к мини-приложению для "
        "ваших клиентов приостановится до погашения.</p>{link}"
        "<p style='font:400 13px/1.6 Arial,sans-serif;color:#999;margin:18px 0 0'>"
        "Оплатить можно и в разделе " + link("Тариф и оплата", _BILLING_PAGE) + ".</p>"
    ),
    "en": (
        "<h2 style='font:800 22px/1.3 Arial,sans-serif;color:#1A1A1A;margin:0 0 14px'>Fee invoice unpaid</h2>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:0'>"
        "Amount: <b style='color:#1A1A1A'>{amount}</b><br>"
        "Due by: <b style='color:#1A1A1A'>{due}</b></p>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:14px 0 0'>"
        "If it's not paid by then, access to the CRM and your client mini-app "
        "will be suspended until it's settled.</p>{link}"
        "<p style='font:400 13px/1.6 Arial,sans-serif;color:#999;margin:18px 0 0'>"
        "You can also pay it from " + link("Billing", _BILLING_PAGE) + ".</p>"
    ),
}

_WARN_LINK = {
    "ru": button("Оплатить счёт", "{url}"),
    "en": button("Pay invoice", "{url}"),
}


def fmt_amount(cents: int) -> str:
    """Сумма счёта в валюте БИЛЛИНГА (евро), а не в валюте кассы студии: тариф
    списывается в евро, чем бы студия ни торговала у себя. Подписать евро кроной
    значит соврать в документе."""
    code = stripe_billing.CURRENCY.upper()
    return f"{cents / 100:,.2f} {_CURRENCY_SIGNS.get(code, code)}".replace(",", " ")


async def _recipient(db: AsyncSession, studio_id: int) -> str | None:
    """Почта студии, иначе почта владельца. Счёт платит студия, но читает человек:
    без фолбэка чек терялся бы у всех, кто не заполнил email студии в настройках."""
    studio_email = (await db.execute(
        select(Studio.email).where(Studio.id == studio_id)
    )).scalar_one_or_none()
    if studio_email:
        return studio_email
    return (await db.execute(
        select(User.email)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(
            StudioMember.studio_id == studio_id,
            StudioMember.role == "owner",
            StudioMember.status == "active",
        )
    )).scalars().first()


async def send_receipt(db: AsyncSession, invoice: BillingInvoice) -> bool:
    """Чек по оплаченному счёту. True — письмо ушло.

    Зовётся ПОСЛЕ commit перехода в paid (routers/billing/webhook.apply_status):
    внутри транзакции SMTP держал бы блокировки строк всё время отправки.
    """
    try:
        plan = (await db.execute(
            select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
        )).scalar_one_or_none()
        # Тумблер «Чек на email» владельца. Нет строки плана — чек не отключали, шлём.
        if plan is not None and not plan.email_receipt_enabled:
            return False

        to = await _recipient(db, invoice.studio_id)
        if not to:
            logger.info("Billing mail: чек по счёту %s некому отправить", invoice.id)
            return False

        lang, _currency = await _studio_prefs(db, invoice.studio_id)
        url = invoice.pdf_url or invoice.hosted_invoice_url
        html = _BODY[lang].format(
            plan=invoice.plan_name,
            period=invoice.period_months,
            amount=fmt_amount(invoice.amount),
            method=_METHOD[lang].get(invoice.payment_method or "", invoice.payment_method or "—"),
            link=_LINK[lang].format(url=url) if url else "",
        )
        await send_email(to, _SUBJECT[lang], html)
        return True
    except Exception:
        logger.exception("Billing mail: чек по счёту %s не отправлен", getattr(invoice, "id", "?"))
        return False


# Уведомление платформе о собственном доходе. НЕ чек: чек получает покупатель, а
# Velora здесь продавец — свой налоговый документ она выпускает сама (фактура
# Stripe). Это письмо нужно, чтобы поступление не приходилось выискивать в
# дашборде Stripe и сводить со студиями руками.
_INCOME_KIND = {
    "subscription": "оплата тарифа",
    "offline_fee": "комиссия с офлайн-продаж",
    "min_fee": "минимальный месячный платёж",
    "online_fee": "комиссия с онлайн-платежей (удержана Stripe)",
}

_INCOME_SUBJECT = "Velora: поступление {amount} — {kind}"

_INCOME_BODY = (
    "<h2 style='font:600 20px/1.3 Arial,sans-serif;color:#1A1A1A'>Поступление</h2>"
    "<p style='font:400 14px/1.7 Arial,sans-serif;color:#666'>"
    "Студия: <b style='color:#1A1A1A'>{studio}</b> (id {studio_id})<br>"
    "Основание: {kind}<br>"
    "Сумма: <b style='color:#1A1A1A'>{amount}</b><br>"
    "Период: {period}<br>"
    "Счёт Stripe: {stripe_id}</p>{link}"
)

_INCOME_LINK = button("Открыть фактуру", "{url}")


async def send_platform_income(db: AsyncSession, invoice: BillingInvoice) -> bool:
    """Уведомить платформу о поступлении по счёту. True — письмо ушло.

    Шлётся на PLATFORM_BILLING_EMAIL и НЕ смотрит на тумблер «Чек на email»: тот
    принадлежит владельцу студии и управляет ЕГО письмами, а не отчётностью
    платформы. Адрес не задан — тихо выходим.

    Язык только русский: адресат один и известен, локализовывать письмо самому
    себе незачем.
    """
    if not PLATFORM_BILLING_EMAIL:
        return False
    try:
        studio_name = (await db.execute(
            select(Studio.name).where(Studio.id == invoice.studio_id)
        )).scalar_one_or_none() or "—"

        amount = fmt_amount(invoice.amount)
        kind = _INCOME_KIND.get(invoice.kind, invoice.kind)
        url = invoice.pdf_url or invoice.hosted_invoice_url
        html = _INCOME_BODY.format(
            studio=studio_name,
            studio_id=invoice.studio_id,
            kind=kind,
            amount=amount,
            period=invoice.period or f"{invoice.period_months} мес.",
            stripe_id=invoice.stripe_invoice_id or "—",
            link=_INCOME_LINK.format(url=url) if url else "",
        )
        await send_email(
            PLATFORM_BILLING_EMAIL,
            _INCOME_SUBJECT.format(amount=amount, kind=kind),
            html,
        )
        return True
    except Exception:
        # getattr, а не invoice.id: обработчик ошибки не имеет права упасть сам.
        # Он зовётся из apply_status ПОСЛЕ коммита оплаты, и исключение отсюда
        # ушло бы наверх 500-м — Stripe заретраил бы уже применённое событие.
        logger.exception(
            "Billing mail: уведомление платформе по счёту %s не отправлено",
            getattr(invoice, "id", "?"),
        )
        return False


async def send_block_warning(db: AsyncSession, invoice: BillingInvoice) -> bool:
    """Предупреждение о скором отключении по неоплаченному счёту за комиссию.

    В отличие от send_receipt НЕ смотрит на тумблер «Чек на email»: это не чек, а
    предупреждение о блокировке, отключать его в обход тумблера для чеков нельзя.
    Отправляется один раз на счёт — факт отправки фиксирует вызывающая сторона
    (services/offline_fee_billing._send_reminders, поле reminder_sent_at).
    """
    try:
        to = await _recipient(db, invoice.studio_id)
        if not to:
            logger.info("Billing mail: напоминание по счёту %s некому отправить", invoice.id)
            return False

        lang, _currency = await _studio_prefs(db, invoice.studio_id)
        url = invoice.hosted_invoice_url or invoice.pdf_url
        html = _WARN_BODY[lang].format(
            amount=fmt_amount(invoice.amount),
            due=invoice.due_at.strftime("%d.%m.%Y") if invoice.due_at else "—",
            link=_WARN_LINK[lang].format(url=url) if url else "",
        )
        await send_email(to, _WARN_SUBJECT[lang], html)
        return True
    except Exception:
        logger.exception(
            "Billing mail: напоминание по счёту %s не отправлено",
            getattr(invoice, "id", "?"),
        )
        return False


# Снятый номер НДС: сверка с VIES не подтвердила его существование
# (routers/billing/webhook._handle_tax_id). Письмо обязательное, а не сервисное —
# со следующего счёта сумма вырастет на ставку НДС, и узнать об этом владелец
# должен до списания, а не из фактуры.
_VAT_SUBJECT = {
    "ru": "Velora — номер НДС не прошёл проверку",
    "en": "Velora — your VAT number failed validation",
}

_VAT_BODY = {
    "ru": (
        "<h2 style='font:800 22px/1.3 Arial,sans-serif;color:#1A1A1A;margin:0 0 14px'>Номер НДС не подтверждён</h2>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:0'>"
        "Номер <b style='color:#1A1A1A'>{vat}</b> не найден в европейской базе "
        "плательщиков НДС (VIES) и удалён из реквизитов вашей студии.</p>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:14px 0 0'>"
        "Следующие счета будут выставлены с учётом НДС. Если номер указан верно и "
        "действителен, впишите его заново — проверка запустится снова.</p>"
        + button("Открыть настройки", f"{WEB_APP_URL}/dashboard/settings")
    ),
    "en": (
        "<h2 style='font:800 22px/1.3 Arial,sans-serif;color:#1A1A1A;margin:0 0 14px'>VAT number not confirmed</h2>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:0'>"
        "Number <b style='color:#1A1A1A'>{vat}</b> was not found in the EU VAT "
        "database (VIES) and has been removed from your studio details.</p>"
        "<p style='font:400 15px/1.7 Arial,sans-serif;color:#666;margin:14px 0 0'>"
        "Upcoming invoices will include VAT. If the number is correct and active, "
        "enter it again to run the check once more.</p>"
        + button("Open settings", f"{WEB_APP_URL}/dashboard/settings")
    ),
}


async def send_vat_rejected(db: AsyncSession, studio_id: int, vat_id: str | None) -> bool:
    """Уведомить студию, что её номер НДС снят после неудачной сверки с VIES.

    Тумблер «Чек на email» здесь НЕ смотрим — как и в send_block_warning: это не
    чек, а предупреждение о том, что счета подорожают на ставку налога, и отключать
    его настройкой для чеков нельзя.
    """
    try:
        to = await _recipient(db, studio_id)
        if not to:
            logger.info("Billing mail: о снятом VAT ID студии %s некому сообщить", studio_id)
            return False

        lang, _currency = await _studio_prefs(db, studio_id)
        html = _VAT_BODY[lang].format(vat=vat_id or "—")
        await send_email(to, _VAT_SUBJECT[lang], html)
        return True
    except Exception:
        logger.exception("Billing mail: письмо о снятом VAT ID студии %s не отправлено", studio_id)
        return False


if __name__ == "__main__":
    import asyncio
    import types

    # Валюта чека — биллинговая (евро), с младшими единицами и разделителем тысяч.
    assert fmt_amount(3900) == "39.00 €", fmt_amount(3900)
    assert fmt_amount(344160) == "3 441.60 €", fmt_amount(344160)

    # Оба языка держат один и тот же набор подстановок: разъехавшийся шаблон падал бы
    # KeyError уже на боевом письме, а не здесь.
    _slots = dict(plan="Pro", period=12, amount="1.00 €", method="card", link="")
    for _lang in ("ru", "en"):
        assert _BODY[_lang].format(**_slots)
        assert "{url}" in _LINK[_lang]
        assert set(_METHOD[_lang]) == {"card", "iban"}

    _warn_slots = dict(amount="39.00 €", due="16.08.2026", link="")
    for _lang in ("ru", "en"):
        assert _WARN_BODY[_lang].format(**_warn_slots)
        assert "{url}" in _WARN_LINK[_lang]
    assert set(_WARN_SUBJECT) == set(_WARN_BODY) == set(_WARN_LINK) == {"ru", "en"}

    for _lang in ("ru", "en"):
        assert _VAT_BODY[_lang].format(vat="DE000000000")
    assert set(_VAT_SUBJECT) == set(_VAT_BODY) == {"ru", "en"}

    # Выключенный тумблер молчит, и до отправки дело не доходит.
    _sent = []
    import services.billing_mail as _self
    _self.send_email = lambda *a, **kw: _sent.append(a)  # type: ignore[assignment]
    _db = types.SimpleNamespace(execute=None)
    _inv = types.SimpleNamespace(id=1, studio_id=1, plan_name="pro", period_months=1,
                                 amount=3900, payment_method="card", pdf_url=None,
                                 hosted_invoice_url=None)

    class _Res:
        def __init__(self, value): self._value = value
        def scalar_one_or_none(self): return self._value

    async def _off(_q):
        return _Res(types.SimpleNamespace(email_receipt_enabled=False))

    _db.execute = _off
    assert asyncio.run(send_receipt(_db, _inv)) is False
    assert not _sent, "чек ушёл при выключенном тумблере"

    print("billing_mail self-check ok")
