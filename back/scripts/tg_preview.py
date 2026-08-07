"""Предпросмотр и живая отправка всех Telegram-уведомлений каталога.

Показывает ровно то, что получит человек в чате: эмодзи, жирный заголовок, тело
на языке студии — по всем 34 событиям и всем четырём ролям (клиент, тренер,
администратор, владелец). Рендер идёт через тот же notifier._render/tg_format,
что и боевая отправка, поэтому предпросмотр не может разойтись с реальностью.

    # только показать (ничего не шлёт, БД не нужна)
    python -m scripts.tg_preview
    python -m scripts.tg_preview --lang en

    # реально прислать в свой чат: chat_id берётся у @userinfobot,
    # токен — из --token или из TG_BOT_TOKEN в .env
    python -m scripts.tg_preview --send 123456789
    python -m scripts.tg_preview --send 123456789 --only o1,t1,c1

ponytail: одноразовый инструмент приёмки, не тест и не воркер — живая отправка
требует явного --send с chat_id, сам по себе скрипт ничего никуда не отправляет.
"""
import argparse
import asyncio
import sys

from services.notification_catalog import CATALOG
from services.notifier import _render, send_telegram, tg_format

# Один «кухонный» контекст на все события: _render берёт из него только свои
# ключи, поэтому демонстрационные значения не надо расписывать по событиям.
DEMO_CONTEXT = {
    "lesson_name": "Хатха-йога",
    "second_lesson_name": "Пилатес",
    "start_time": "12 августа, 18:00",
    "hours": 2,
    "amount": 4500,
    "remaining": 2,
    "client_name": "Анна Петрова",
    "staff_name": "Мария Иванова",
    "names": "Анна Петрова, Игорь Ким, Ольга Ли",
    "period_start": "01.08",
    "period_end": "15.08",
    "revenue": 128400,
    "avg7": 196000,
    "lessons": 12,
    "new_clients": 4,
    "goal_name": "Выручка 500 000 в августе",
    "days_left": 3,
    "role": "admin",
    "resource": "hall",
    "device": "Chrome / Windows",
    "city": "Москва",
    "kind": "операции",
    "rating": 5,
    "description": "Бонус за отзыв о занятии",
}

ROLE_TITLES = {
    "client": "КЛИЕНТ", "trainer": "ТРЕНЕР",
    "admin": "АДМИНИСТРАТОР", "owner": "ВЛАДЕЛЕЦ",
}


def messages(lang: str, currency: str, only: set[str] | None):
    """[(event_id, role, telegram-текст)] в порядке ролей каталога."""
    out = []
    for role in ROLE_TITLES:
        for event_id, spec in CATALOG.items():
            if spec.role != role or (only and event_id not in only):
                continue
            rendered = _render(event_id, DEMO_CONTEXT, lang, currency)
            if rendered is None:
                continue
            subject, text, _ = rendered
            out.append((event_id, role, tg_format(event_id, subject, text)))
    return out


def preview(items) -> None:
    role_shown = None
    for event_id, role, tg in items:
        if role != role_shown:
            role_shown = role
            print(f"\n{'=' * 60}\n  {ROLE_TITLES[role]}\n{'=' * 60}")
        default = ", ".join(CATALOG[event_id].default_channels) or "выключено по умолчанию"
        print(f"\n--- {event_id} ({CATALOG[event_id].tier}; каналы: {default}) ---")
        print(tg.replace("<b>", "").replace("</b>", ""))  # теги — разметка, не текст


async def send_all(items, chat_id: int, token: str | None) -> int:
    ok = 0
    for event_id, _role, tg in items:
        if await send_telegram(chat_id, tg, token, parse_mode="HTML"):
            ok += 1
            print(f"  отправлено: {event_id}")
        else:
            print(f"  НЕ отправлено: {event_id}")
        await asyncio.sleep(0.35)  # лимит Bot API ~30 сообщений в секунду
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lang", default="ru", choices=("ru", "en"))
    parser.add_argument("--currency", default="RUB")
    parser.add_argument("--send", type=int, metavar="CHAT_ID", help="реально отправить в этот чат")
    parser.add_argument("--token", help="токен бота; по умолчанию TG_BOT_TOKEN из .env")
    parser.add_argument("--only", help="список event_id через запятую, напр. c1,t1,o1")
    args = parser.parse_args()

    only = {e.strip() for e in args.only.split(",")} if args.only else None
    items = messages(args.lang, args.currency, only)
    if not items:
        print("Нечего показывать: ни один event_id не подошёл под --only")
        return 1

    preview(items)
    if args.send is None:
        print(f"\n{len(items)} сообщений. Чтобы прислать их в Telegram: --send <chat_id>")
        return 0

    print(f"\nОтправка {len(items)} сообщений в чат {args.send}...")
    ok = asyncio.run(send_all(items, args.send, args.token))
    print(f"Доставлено {ok} из {len(items)}")
    return 0 if ok == len(items) else 1


if __name__ == "__main__":
    sys.exit(main())
