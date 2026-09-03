"""Вебхук входящих Telegram-обновлений своего бота студии: /start -> мини-приложение.

Каждая студия подключает СВОЙ бот собственным токеном (services/telegram_bot.py),
поэтому вебхук не может опираться на один секрет платформы — токен в самом URL
и адресует апдейт к студии, и служит секретом (без него запрос никто не соберёт;
Telegram его тоже не публикует).
"""
import logging
import os
from html import escape

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import BookingChannelConfig, Studio
from services import inbound
from services.studio_link import ref_of

logger = logging.getLogger(__name__)
router = APIRouter()

MINIAPP_URL = os.getenv("MINIAPP_URL", "http://localhost:5174").rstrip("/")

# Ответ на /start объясняет ровно то, чего человек не может знать сам: Start
# открыл боту диалог, но кто он такой, мы ещё не знаем. Телефона и почты Telegram
# в апдейте не присылает, связать чат с карточкой клиента не по чему — это
# происходит на первом входе в мини-приложение (подписанный initData, miniapp.py).
# Поэтому текст ведёт не «посмотрите приложение», а «зайдите, иначе уведомлений
# не будет». Эмодзи здесь уместны: это чат с клиентом студии, а не интерфейс
# CRM (CLAUDE.md §5) — и обращение именно к клиенту, не к владельцу студии:
# этого бота открывает человек, который хочет записаться на занятие.
_BUTTON_TEXT = "🧘 Записаться на занятие"
_START_INTRO = (
    "👋 <b>Привет!</b>\n\n"
    "Это бот студии{studio_name}. Здесь вы сможете:\n\n"
    "📅  записаться на занятие и посмотреть расписание\n"
    "🎟  проверить абонемент — сколько занятий осталось и до какого числа\n"
    "⭐  посмотреть свою карту лояльности и баллы\n\n"
    "А я буду присылать сюда:\n\n"
    "✅  подтверждение записи\n"
    "⏰  напоминание перед занятием\n"
    "🎁  бонусы и специальные предложения\n\n"
)
_START_CTA = (
    "Чтобы начать, откройте приложение {where} 👇\n"
    "Как только вы зайдёте туда один раз, я буду знать, что писать именно вам."
)


def _is_start(text: str) -> bool:
    return text.strip().startswith("/start")


async def greeting(db, studio_id: int) -> dict:
    """Приветствие на /start — каноническим намерением, а не телом Telegram.

    Кнопка описана смыслом («ссылка туда-то»), в inline-клавиатуру её превращает
    отправщик (services/channels/telegram.render). Так добавление кнопок в
    другие каналы становится делом рендерера, а не миграции данных. Транспорт и
    индикатор «печатает…» уехали туда же: роутер — граница вебхука, сеть — в
    сервисе.
    """
    # Studio.name не nullable в схеме, но здесь мы вне транзакции создания
    # студии — пустая строка на всякий случай не рвёт фразу знаком «« »».
    studio = (await db.execute(
        select(Studio.name, Studio.public_code).where(Studio.id == studio_id))).first()
    studio_name = (studio.name if studio else None) or ""
    name_part = f" «{escape(studio_name, quote=False)}»" if studio_name else ""
    return {
        "text": _START_INTRO.format(studio_name=name_part) + _START_CTA,
        "parse_mode": "HTML",
        # Ссылка — по публичному коду студии, а не по её id (services/studio_link).
        "button": {"text": _BUTTON_TEXT, "url": f"{MINIAPP_URL}/s/{ref_of(studio, studio_id)}"},
    }


async def _studio_by_token(db: AsyncSession, token: str) -> int | None:
    """studio_id подключённого telegram-канала с этим токеном.

    ponytail: линейный перебор активных telegram-каналов, как в
    routers/ai/whatsapp.py::_studio_by_phone_number_id — их единицы на бэкенд;
    индекс по config->>'token' понадобится при росте числа студий."""
    rows = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.channel_type == "telegram",
            BookingChannelConfig.is_active == True,  # noqa: E712
        )
    )).scalars().all()
    for row in rows:
        if (row.config or {}).get("token") == token:
            return row.studio_id
    return None


@router.post("/telegram/webhook/{token}")
async def telegram_webhook(
    token: str,
    request: Request,
    # Ничего не планирует с P0.3 и остаётся намеренно: параметр — граница,
    # на которой архитектурный тест проверяет, что web не запускает агента.
    background: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
):
    """/start -> приветствие с кнопкой мини-приложения, остальной текст -> ассистент студии.

    Ветка ассистента живёт ЗДЕСЬ, а не в routers/ai/, потому что у бота может
    быть ровно один webhook-URL: повторный setWebhook молча отобрал бы апдейты у
    онбординга, и мини-приложение перестало бы открываться — регрессия без единой
    ошибки в логах (эпик AI-5, задача 12, п. 7).

    Всегда 200: Telegram ретраит недоставленные апдейты, и любой 4xx/5xx задвоил
    бы приветствие тем же паттерном, что и вебхук WhatsApp/Instagram.
    """
    try:
        update = await request.json()
    except ValueError:
        return {"ok": True}

    message = update.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    text = message.get("text") or ""
    if chat_id is None or not text:
        return {"ok": True}

    studio_id = await _studio_by_token(db, token)
    if studio_id is None:
        # Канал онлайн-записи выключили, оставив тумблер агента включённым —
        # апдейты перестают находить студию, и агент замолкает без единой строки
        # в логе. Отсюда WARNING с хвостом токена: иначе это неотличимо от
        # «бота никто не подключал».
        logger.warning("telegram webhook: студия не найдена, канал записи выключен? token=…%s", token[-6:])
        return {"ok": True}

    # Приём — ПОСЛЕ опознания студии по токену (он же секрет вебхука) и ПЕРЕД
    # любым побочным действием. update_id уникален в пределах ОДНОГО бота, а
    # ботов у нас столько же, сколько студий, — поэтому в ключ входит студия,
    # иначе апдейт №1 второй студии выглядел бы дублем апдейта №1 первой.
    # Апдейта без update_id не бывает, но ключ «studio:None» из него был бы
    # выдуманным: два разных битых апдейта склеились бы в один.
    update_id = update.get("update_id")
    admission = await inbound.admit(
        inbound.TELEGRAM, f"{studio_id}:{update_id}" if update_id is not None else None,
        studio_id, inbound.MESSAGE, str(chat_id), text, update,
    )
    if not admission.accepted:
        # Повтор той же доставки. Ответ обычный 200: 4xx/5xx заставили бы
        # Telegram ретраить её снова и снова. Работа по оригиналу жива.
        logger.info("telegram webhook: повтор апдейта отброшен, studio_id=%s", studio_id)
        return {"ok": True}

    # Обе ветки — и приветствие на /start, и ответ ассистента — исполняет одна
    # работа (services/agent_jobs::_handle). Раньше приветствие уходило прямо
    # здесь, синхронно: упал процесс или Telegram — и человек не получал ничего.
    # Ответственность web на этом закончилась: работа лежит в БД, её возьмёт
    # процесс-исполнитель (`python -m workers.main`). Запускать агента здесь
    # значило бы снова привязать ответ клиенту к жизни web-реплики.
    return {"ok": True}


if __name__ == "__main__":
    assert _is_start("/start")
    assert _is_start("/start ref_abc123")
    assert _is_start("  /start")
    assert not _is_start("привет")
    assert not _is_start("")

    # Приветствие — намерение, а не тело Telegram: текст плюс описание кнопки.
    # Как оно ляжет в inline-клавиатуру (и ляжет ли — на http Telegram отверг бы
    # сообщение целиком), решает services/channels/telegram.render, и проверено
    # это там же.
    from html import escape as _e

    intro = _START_INTRO.format(studio_name=" «Velora Yoga»") + _START_CTA
    assert "«Velora Yoga»" in intro
    # Разметка — только <b></b>: незакрытый или лишний тег = 400 от Telegram,
    # и человек не получает на /start вообще ничего.
    assert intro.count("<") == intro.count(">") == 2

    # Название с HTML-символами не должно ломать разметку сообщения.
    hostile = _START_INTRO.format(studio_name=f" «{_e('Fit & <Yoga>', quote=False)}»") + _START_CTA
    assert "Fit &amp; &lt;Yoga&gt;" in hostile
    assert hostile.count("<") == hostile.count(">") == 2

    # Пустое имя студии — фраза не рвётся пустыми кавычками.
    assert "Это бот студии. Здесь" in _START_INTRO.format(studio_name="")

    print("telegram_webhook self-check ok")
