"""Почтовый отправщик (SMTP). Единственный реальный канал доставки.

Креды из .env: SMTP_HOST/PORT/USER/PASS/FROM. Нет кредов → dev-фолбэк в print.
"""
import logging
import os
from email.message import EmailMessage

import aiosmtplib
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, html: str, sender: str | None = None) -> None:
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

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    message.set_content(html, subtype="html")

    await aiosmtplib.send(
        message,
        hostname=host,
        port=port,
        username=user,
        password=password,
        start_tls=True,
    )
