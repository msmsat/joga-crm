"""Почтовый отправщик (SMTP). Единственный реальный канал доставки.

Креды из .env: SMTP_HOST/PORT/USER/PASS/FROM. Нет кредов → dev-фолбэк в print.

Вёрстка писем здесь и заканчивается: любой фрагмент оборачивается в оболочку
продукта (services/email_layout.wrap) прямо перед отправкой — поэтому места
отправки собирают только содержательную часть письма и ничего не знают про
таблицы, шапку и подвал. Уже готовый документ проходит насквозь (email_layout.MARK).

Self-check (письмо собирается, отправки не происходит):  python -m services.mailer
"""
import logging
import os
from email.message import EmailMessage

import aiosmtplib
from dotenv import load_dotenv

from services import email_layout

load_dotenv()
logger = logging.getLogger(__name__)

# Домены, которых по стандарту НЕ существует в DNS (RFC 2606 / RFC 6761). SMTP
# такое письмо ПРИНИМАЕТ, а через минуту возвращает баунс на ящик SMTP_USER —
# то есть каждая отправка на тестовый адрес превращается в письмо владельцу
# почты. Ловим здесь, у единственной двери наружу: адреса вида
# epic5-test-...@example.invalid попадают в БД из тестов (tests/test_danger_zone.py)
# и переживают прогон, а дальше их каждый вечер подхватывает daily_notify.
_UNDELIVERABLE = (
    ".invalid", ".test", ".example", ".localhost",           # RFC 6761 reserved TLD
    "@example.com", "@example.net", "@example.org",          # RFC 2606 reserved domains
)


def build_message(
    to: str, subject: str, html: str, sender: str | None, brand: str | None,
    greeting: str | None = None, calendar: bytes | None = None, lang: str | None = None,
) -> EmailMessage:
    """Готовое письмо: оболочка вокруг фрагмента + текстовая версия рядом с HTML.

    `calendar` — файл .ics: почтовый клиент предлагает положить занятие в
    календарь одним касанием. Вложение делает письмо multipart/mixed, поэтому
    добавляется последним — иначе text/plain и text/html перестали бы быть
    альтернативами друг другу и клиент показал бы обе.

    `lang` — язык подвала оболочки; не передан — определяется по тексту письма
    (email_layout.wrap).

    Отдельно от отправки, чтобы сборку можно было проверить, не поднимая SMTP.
    """
    body = email_layout.wrap(html, title=subject, brand=brand or "Velora", greeting=greeting, lang=lang)

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    # Сначала текст, потом HTML: в multipart/alternative клиент показывает
    # последнюю часть, которую умеет, а спам-фильтры хотят видеть обе.
    message.set_content(email_layout.plain_text(body))
    message.add_alternative(body, subtype="html")
    if calendar:
        message.add_attachment(
            calendar, maintype="text", subtype="calendar", filename="lesson.ics",
        )
    return message


def is_deliverable(to: str) -> bool:
    """False — адрес на зарезервированном домене, письмо на него физически не
    доставить (см. _UNDELIVERABLE)."""
    return not (to or "").strip().lower().rstrip(".").endswith(_UNDELIVERABLE)


async def send_email(
    to: str, subject: str, html: str, sender: str | None = None, brand: str | None = None,
    greeting: str | None = None, calendar: bytes | None = None, lang: str | None = None,
) -> bool:
    """Возвращает True, если письмо ушло (или дев-фолбэк его напечатал).
    `brand` — имя в шапке письма: студия пишет клиенту от своего имени, а не
    от имени CRM, которой он не покупал. Не передан — письмо платформы (Velora).
    `greeting` — обращение по имени, `calendar` — вложенный .ics с занятием.
    `lang` — язык подвала оболочки; не передан — определяется по тексту письма
    (email_layout.wrap), что для украинского даёт русский подвал."""
    if not is_deliverable(to):
        logger.warning("mailer: %s — зарезервированный домен (RFC 2606/6761), не отправляем", to)
        return False

    host = os.getenv("SMTP_HOST")
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    sender = sender or os.getenv("SMTP_FROM", user)
    port = int(os.getenv("SMTP_PORT", "587"))

    if not (host and user and password):
        print("\n" + "=" * 40)
        print(f"[MAILER dev] Кому: {to}")
        print(f"Тема: {subject}")
        print(html)
        print("=" * 40 + "\n")
        return True

    await aiosmtplib.send(
        build_message(to, subject, html, sender, brand, greeting, calendar, lang),
        hostname=host,
        port=port,
        username=user,
        password=password,
        start_tls=True,
    )
    return True


if __name__ == "__main__":
    msg = build_message("k@x.com", "Запись подтверждена", "<p>Вы записаны на «Хатха-йога».</p>",
                        None, "Студия Лотос")
    assert msg.is_multipart(), "письмо без текстовой версии почтовики считают рассылкой"
    types = [p.get_content_type() for p in msg.iter_parts()]
    assert types == ["text/plain", "text/html"], types
    plain, rich = (p.get_content() for p in msg.iter_parts())
    assert "Вы записаны" in plain and "<" not in plain, plain
    assert "Студия Лотос" in rich and email_layout.MARK in rich

    # Зарезервированные домены не должны уходить в SMTP: каждый такой адрес —
    # гарантированный баунс в ящик отправителя.
    assert not is_deliverable("epic5-test-75ce106f@example.invalid")
    assert not is_deliverable("a@Foo.TEST")
    assert not is_deliverable("a@example.com")
    assert not is_deliverable("a@host.localhost.")  # DNS-корневая точка на конце
    assert is_deliverable("sadomat31@gmail.com")
    assert is_deliverable("a@invalid-domain.ru")    # .invalid только как весь TLD
    print("mailer self-check ok")
