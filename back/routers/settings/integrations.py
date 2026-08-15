import logging
import secrets
from datetime import datetime, timedelta

import aiohttp
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioIntegration
from schemas.settings.integrations import (
    ChannelStatus,
    EmailCodeRequest,
    EmailCodeVerify,
    IgConnect,
    IntegrationStatus,
    IntegrationType,
    NotifyChannelsStatus,
    TgConnect,
    WaConnect,
    WaPricing,
)
from services.assistant import get_or_create_ai_settings
from services.email_layout import code_block
from services.instagram_account import FB_LOGIN_API, connect_instagram_account, disconnect_instagram_account
from services.mailer import send_email
from services.notifier import _studio_prefs
from services.telegram_bot import connect_telegram_bot, disconnect_telegram_bot, verify_bot_token
from services.whatsapp import (
    refresh_payment_status,
    refresh_template_statuses,
    sync_templates_for_studio,
    sync_templates_on_connect,
    template_summary,
    wa_integration,
)

logger = logging.getLogger(__name__)

router = APIRouter()

GRAPH = "https://graph.facebook.com/v23.0"
_DEFAULT_WA_PRICING = WaPricing(price_per_message=0.08, currency="USD", source="default")


async def _get_or_create_integration(db: AsyncSession, studio_id: int, kind: str) -> StudioIntegration:
    integ = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id,
            StudioIntegration.integration_type == kind,
        )
    )).scalar_one_or_none()
    if integ is None:
        integ = StudioIntegration(studio_id=studio_id, integration_type=kind)
        db.add(integ)
        await db.commit()
        await db.refresh(integ)
    return integ


def _mask_token(token: str) -> str:
    return f"{token[:6]}…{token[-4:]}" if len(token) > 10 else "…"


# Публичный тип интеграции (для API) -> внутренний StudioIntegration.integration_type
_INTEGRATION_TYPE_MAP: dict[IntegrationType, str] = {
    "telegram": "tg_notify",
    "whatsapp": "wa_notify",
    "instagram": "ig_dm",
    "google_calendar": "gcal",
}

_INTEGRATION_CAPABILITIES: dict[IntegrationType, list[str]] = {
    "telegram": ["notify", "booking"],
    "whatsapp": ["notify", "booking"],
    "instagram": ["dm_agent", "booking"],
    "google_calendar": ["schedule_sync"],
}


def _integration_details(integ: StudioIntegration | None, kind: str) -> dict | None:
    # config хранится открытым JSON в БД (см. эпик 6);
    # ponytail: секреты в БД открытым текстом; шифрование at-rest — когда появится KMS/vault.
    if integ is None or not integ.is_connected:
        return None
    config = integ.config or {}
    if kind == "tg_notify":
        return {"bot_username": config.get("bot_username"), "token_masked": _mask_token(config.get("token", ""))}
    if kind == "wa_notify":
        return {"phone_number_id": config.get("phone_number_id"), "display_phone_number": config.get("display_phone_number")}
    if kind == "ig_dm":
        return {"username": config.get("username"), "token_masked": _mask_token(config.get("token", ""))}
    return {  # gcal
        "calendar_id": config.get("calendar_id"),
        "calendar_name": config.get("calendar_name"),
        "connected_email": config.get("connected_email"),
    }


def _integration_status(type_: IntegrationType, integ: StudioIntegration | None) -> IntegrationStatus:
    connected = bool(integ and integ.is_connected)
    kind = _INTEGRATION_TYPE_MAP[type_]
    return IntegrationStatus(
        type=type_,
        connected=connected,
        connected_at=integ.updated_at if connected else None,
        details=_integration_details(integ, kind),
        capabilities=_INTEGRATION_CAPABILITIES[type_],
    )


def _channel_status(integ: StudioIntegration | None, kind: str) -> ChannelStatus:
    if integ is None or not integ.is_connected:
        return ChannelStatus()
    config = integ.config or {}
    if kind == "tg_notify":
        details = {"bot_username": config.get("bot_username"), "token_masked": _mask_token(config.get("token", ""))}
    elif kind == "email_sender":
        details = {"email": config.get("email"), "verified": config.get("verified", False)}
    elif kind == "ig_dm":
        details = {"username": config.get("username"), "token_masked": _mask_token(config.get("token", ""))}
    else:  # wa_notify
        details = {
            "phone_number_id": config.get("phone_number_id"),
            "display_phone_number": config.get("display_phone_number"),
            # Три состояния, а не два: True — условие выполнено, False — нет,
            # None — ещё не проверяли или Meta не ответила. См. services/whatsapp.py.
            "payment_connected": config.get("payment_connected"),
            # Верификацию Business Portfolio проходит САМА студия: её WABA
            # CLIENT_OWNED, приложение Velora к её бизнесу отношения не имеет.
            # Без неё номер живёт в пониженном лимите — отсюда инструкция в UI.
            "business_verified": config.get("business_verified"),
            # Третье условие доставки и такая же трёхзначная логика: None —
            # статусы ещё не читали. Каждый шаблон Meta модерирует отдельно, и
            # отклонённый молча хоронит своё событие, если не показать это здесь.
            "templates": template_summary(config),
        }
    return ChannelStatus(connected=True, details=details)


@router.get("/integrations/notify-channels", response_model=NotifyChannelsStatus)
async def get_notify_channels_status(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    # Каналы рассылок и только они. ig_dm сюда не входит: Instagram проактивным
    # каналом больше не является (см. докстринг services/notifier.py), его
    # подключение живёт на Velora AI и в Настройках → Интеграции — там, где им
    # пользуется ИИ-агент.
    rows = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == ctx.studio_id,
            StudioIntegration.integration_type.in_(("tg_notify", "wa_notify", "email_sender")),
        )
    )).scalars().all()
    by_kind = {row.integration_type: row for row in rows}
    return NotifyChannelsStatus(
        telegram=_channel_status(by_kind.get("tg_notify"), "tg_notify"),
        whatsapp=_channel_status(by_kind.get("wa_notify"), "wa_notify"),
        email=_channel_status(by_kind.get("email_sender"), "email_sender"),
    )


@router.post("/integrations/telegram", response_model=ChannelStatus)
async def connect_telegram(
    body: TgConnect,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    username = await verify_bot_token(body.token)
    await connect_telegram_bot(db, ctx.studio_id, body.token, username)

    integ = await _get_or_create_integration(db, ctx.studio_id, "tg_notify")
    return _channel_status(integ, "tg_notify")


@router.delete("/integrations/telegram", response_model=ChannelStatus)
async def disconnect_telegram(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    await disconnect_telegram_bot(db, ctx.studio_id)
    return ChannelStatus()


@router.post("/integrations/email/request-code", response_model=ChannelStatus)
async def request_email_code(
    body: EmailCodeRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    code = f"{secrets.randbelow(1_000_000):06d}"
    integ = await _get_or_create_integration(db, ctx.studio_id, "email_sender")
    integ.config = {
        "email": body.email,
        "code": code,
        "expires_at": (datetime.utcnow() + timedelta(minutes=10)).isoformat(),
        "verified": False,
    }
    integ.is_connected = False
    await db.commit()
    await db.refresh(integ)

    lang, _ = await _studio_prefs(db, ctx.studio_id)
    subject = "Код подтверждения" if lang == "ru" else "Verification code"
    intro = (
        "<p>Введите этот код в разделе «Настройки» → «Интеграции», чтобы "
        "письма клиентам уходили с этого адреса.</p>" if lang == "ru" else
        "<p>Enter this code in Settings → Integrations to send client emails "
        "from this address.</p>"
    )
    try:
        await send_email(body.email, subject, intro + code_block(code))
    except Exception:
        logger.exception("request_email_code: send_email failed for studio=%s", ctx.studio_id)

    return _channel_status(integ, "email_sender")


@router.post("/integrations/email/verify", response_model=ChannelStatus)
async def verify_email_code(
    body: EmailCodeVerify,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    integ = await _get_or_create_integration(db, ctx.studio_id, "email_sender")
    config = integ.config or {}
    expires_at = config.get("expires_at")
    is_expired = not expires_at or datetime.utcnow() > datetime.fromisoformat(expires_at)
    if not config.get("code") or body.code != config.get("code") or is_expired:
        raise HTTPException(status_code=400, detail="Неверный или просроченный код")

    integ.config = {"email": config["email"], "verified": True}
    integ.is_connected = True
    await db.commit()
    await db.refresh(integ)
    return _channel_status(integ, "email_sender")


@router.post("/integrations/whatsapp", response_model=ChannelStatus)
async def connect_whatsapp(
    body: WaConnect,
    background: BackgroundTasks,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    headers = {"Authorization": f"Bearer {body.token}"}
    url = f"{GRAPH}/{body.phone_number_id}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, params={"fields": "display_phone_number"}) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=400, detail="Meta не принял токен или phone_number_id")
                data = await resp.json()
    except aiohttp.ClientError:
        raise HTTPException(status_code=400, detail="Meta не принял токен или phone_number_id")

    # Без подписки приложения на WABA Meta не пришлёт ни одного входящего, даже
    # когда callback URL настроен и токен валиден: канал выглядит подключённым, а
    # автоответчик молчит. Embedded Signup делает это сам (routers/ai/whatsapp.py),
    # ручному пути шаг нужен здесь. Упало — подключение всё равно состоялось,
    # исходящие уведомления работают; видно по логу.
    if body.waba_id:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{GRAPH}/{body.waba_id}/subscribed_apps", headers=headers) as resp:
                    if resp.status >= 400:
                        logger.error("connect_whatsapp: subscribed_apps %s: %s",
                                     resp.status, (await resp.text())[:400])
        except aiohttp.ClientError:
            logger.exception("connect_whatsapp: subscribed_apps failed for studio=%s", ctx.studio_id)

    integ = await _get_or_create_integration(db, ctx.studio_id, "wa_notify")
    integ.config = {
        "token": body.token,
        "phone_number_id": body.phone_number_id,
        "waba_id": body.waba_id,
        "display_phone_number": data.get("display_phone_number"),
    }
    integ.is_connected = True
    await db.commit()
    await db.refresh(integ)
    # Сразу выясняем, привязана ли карта: без неё канал доставит только ответы
    # в 24-часовом окне, и это надо показать студии в тот же момент, а не когда
    # первое напоминание молча не уйдёт.
    await refresh_payment_status(db, integ)
    # По той же причине сразу заводим шаблоны — фоном, потому что это 76 запросов
    # к Meta (services/whatsapp.py::sync_templates_on_connect).
    if body.waba_id:
        background.add_task(sync_templates_on_connect, ctx.studio_id)
    return _channel_status(integ, "wa_notify")


async def _disconnect_whatsapp_number(db: AsyncSession, studio_id: int) -> None:
    """Гасит номер вместе с тумблером WhatsApp-агента. Коммитит сам.

    Своего подключения у агента нет — он живёт на этой же интеграции. Оставить
    wa_enabled включённым значит, что при следующем подключении номера агент
    молча начнёт отвечать клиентам, хотя владелец его не включал; у Telegram и
    Instagram это гасят их общие сервисы.
    """
    ai = await get_or_create_ai_settings(studio_id, db)
    ai.wa_enabled = False

    integ = await _get_or_create_integration(db, studio_id, "wa_notify")
    integ.is_connected = False
    integ.config = None
    await db.commit()


@router.delete("/integrations/whatsapp", response_model=ChannelStatus)
async def disconnect_whatsapp(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    await _disconnect_whatsapp_number(db, ctx.studio_id)
    return ChannelStatus()


@router.post("/integrations/whatsapp/payment-check", response_model=ChannelStatus)
async def check_whatsapp_payment(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Перепроверить готовность канала на стороне Meta и вернуть свежий статус.

    Дёргается фронтом в двух точках: при открытии модалки WhatsApp и при
    включении тумблера канала — и карту, и вердикт по шаблонам меняет Meta, о чём
    нам никто не сообщает, так что дешевле спросить в момент, когда ответ нужен.
    Шаблоны здесь же, а не отдельной ручкой: обе проверки нужны ровно в одних и
    тех же двух точках, и второй раунд-трип из UI ничего бы не дал.
    """
    integ = await wa_integration(db, ctx.studio_id)
    if integ is None or not integ.is_connected:
        return ChannelStatus()
    await refresh_payment_status(db, integ)
    await refresh_template_statuses(db, integ)
    return _channel_status(integ, "wa_notify")


@router.post("/integrations/whatsapp/templates-sync")
async def sync_whatsapp_templates(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Перезавести на WABA студии шаблоны всех 38 событий (по 2 языка).

    При подключении номера это происходит само (sync_templates_on_connect) —
    ручка осталась на случай, когда автосинхронизация не прошла: Meta лежала,
    номер подключали до появления автозапуска, шаблон удалили руками. Никому
    ничего не отправляет: шаблоны уходят на модерацию и работают после APPROVED.
    """
    integ = await wa_integration(db, ctx.studio_id)
    if integ is None or not integ.is_connected:
        raise HTTPException(status_code=409, detail="wa_not_connected")
    if not (integ.config or {}).get("waba_id"):
        # Ручное подключение без WABA ID: шаблоны заводить некуда.
        raise HTTPException(status_code=409, detail="wa_waba_id_required")
    return await sync_templates_for_studio(db, integ)


@router.get("/integrations/whatsapp/pricing", response_model=WaPricing)
async def get_whatsapp_pricing(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    integ = await wa_integration(db, ctx.studio_id)
    if integ is None or not integ.is_connected:
        return _DEFAULT_WA_PRICING
    config = integ.config or {}
    waba_id = config.get("waba_id")
    if not waba_id:
        return _DEFAULT_WA_PRICING

    try:
        headers = {"Authorization": f"Bearer {config.get('token')}"}
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{GRAPH}/{waba_id}/pricing_analytics", headers=headers) as resp:
                if resp.status != 200:
                    return _DEFAULT_WA_PRICING
                data = await resp.json()
        points = data.get("data", [])
        if not points:
            return _DEFAULT_WA_PRICING
        prices = [p["price"] for p in points if p.get("price") is not None]
        if not prices:
            return _DEFAULT_WA_PRICING
        avg_price = sum(prices) / len(prices)
        currency = points[0].get("currency", "USD")
        return WaPricing(price_per_message=round(avg_price, 4), currency=currency, source="meta")
    except Exception:
        logger.exception("get_whatsapp_pricing failed for studio=%s", ctx.studio_id)
        return _DEFAULT_WA_PRICING


@router.post("/integrations/instagram", response_model=ChannelStatus)
async def connect_instagram(
    body: IgConnect,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    headers = {"Authorization": f"Bearer {body.token}"}
    url = f"{GRAPH}/{body.ig_user_id}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, params={"fields": "username"}) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=400, detail="Meta не принял токен или ig_user_id")
                data = await resp.json()
    except aiohttp.ClientError:
        raise HTTPException(status_code=400, detail="Meta не принял токен или ig_user_id")

    # Аккаунт один на всю CRM: тем же вызовом он появляется и у AI-агента.
    await connect_instagram_account(
        db, ctx.studio_id,
        token=body.token, ig_user_id=body.ig_user_id, username=data.get("username"),
        api=FB_LOGIN_API,
    )
    integ = await _get_or_create_integration(db, ctx.studio_id, "ig_dm")
    return _channel_status(integ, "ig_dm")


@router.get("/integrations", response_model=list[IntegrationStatus])
async def list_integrations(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == ctx.studio_id,
            StudioIntegration.integration_type.in_(_INTEGRATION_TYPE_MAP.values()),
        )
    )).scalars().all()
    by_kind = {row.integration_type: row for row in rows}
    return [
        _integration_status(type_, by_kind.get(kind))
        for type_, kind in _INTEGRATION_TYPE_MAP.items()
    ]


@router.delete("/integrations/{integration_type}", response_model=IntegrationStatus)
async def disconnect_integration(
    integration_type: IntegrationType,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    # Telegram-бот, Instagram-аккаунт и WhatsApp-номер живут ещё и в настройках
    # AI-агента (бот — и в Онлайн-записи). Гасить только эту строку — оставить там
    # живой токен-сироту и включённый тумблер агента, поэтому все трое идут через
    # свой общий путь отключения.
    if integration_type == "telegram":
        await disconnect_telegram_bot(db, ctx.studio_id)
    elif integration_type == "instagram":
        await disconnect_instagram_account(db, ctx.studio_id)
    elif integration_type == "whatsapp":
        await _disconnect_whatsapp_number(db, ctx.studio_id)
    else:
        integ = await _get_or_create_integration(db, ctx.studio_id, _INTEGRATION_TYPE_MAP[integration_type])
        integ.is_connected = False
        integ.config = None
        await db.commit()

    integ = await _get_or_create_integration(db, ctx.studio_id, _INTEGRATION_TYPE_MAP[integration_type])
    await db.refresh(integ)
    return _integration_status(integration_type, integ)
