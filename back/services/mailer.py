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


def build_message(
    to: str, subject: str, html: str, sender: str | None, brand: str | None,
) -> EmailMessage:
    """Готовое письмо: оболочка вокруг фрагмента + текстовая версия рядом с HTML.

    Отдельно от отправки, чтобы сборку можно было проверить, не поднимая SMTP.
    """
    body = email_layout.wrap(html, title=subject, brand=brand or "Velora")

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    # Сначала текст, потом HTML: в multipart/alternative клиент показывает
    # последнюю часть, которую умеет, а спам-фильтры хотят видеть обе.
    message.set_content(email_layout.plain_text(body))
    message.add_alternative(body, subtype="html")
    return message


async def send_email(
    to: str, subject: str, html: str, sender: str | None = None, brand: str | None = None,
) -> None:
    """`brand` — имя в шапке письма: студия пишет клиенту от своего имени, а не
    от имени CRM, которой он не покупал. Не передан — письмо платформы (Velora)."""
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
        return

    await aiosmtplib.send(
        build_message(to, subject, html, sender, brand),
        hostname=host,
        port=port,
        username=user,
        password=password,
        start_tls=True,
    )


if __name__ == "__main__":
    msg = build_message("k@x.com", "Запись подтверждена", "<p>Вы записаны на «Хатха-йога».</p>",
                        None, "Студия Лотос")
    assert msg.is_multipart(), "письмо без текстовой версии почтовики считают рассылкой"
    types = [p.get_content_type() for p in msg.iter_parts()]
    assert types == ["text/plain", "text/html"], types
    plain, rich = (p.get_content() for p in msg.iter_parts())
    assert "Вы записаны" in plain and "<" not in plain, plain
    assert "Студия Лотос" in rich and email_layout.MARK in rich
    print("mailer self-check ok")
