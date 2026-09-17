"""Запись визита на лендинг: нормализация, дедупликация, обрезка.

Вынесено из роутера, потому что тут три отдельных правила, каждое из которых
проверяется само по себе: чем считать устройство, что считать повтором и как
не уронить вставку слишком длинной строкой.
"""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LandingVisit

# Окно, внутри которого повторный заход того же браузера на тот же путь
# считается тем же визитом.
DEDUP_MINUTES = 30

_TABLET = ("ipad", "tablet", "playbook", "silk")
_MOBILE = ("iphone", "ipod", "android", "mobile", "windows phone", "opera mini")


def device_from_ua(user_agent: str | None) -> str:
    """Грубая, но честная классификация. Полноценный парсер UA сюда не нужен:
    в отчёте различаются три корзины, и цена ошибки — одна строка графика."""
    ua = (user_agent or "").lower()
    if not ua:
        return "unknown"
    if any(marker in ua for marker in _TABLET):
        return "tablet"
    # Android-планшет от телефона отличается отсутствием слова mobile — это
    # рекомендация самих Android-доков, а не догадка.
    if "android" in ua and "mobile" not in ua:
        return "tablet"
    if any(marker in ua for marker in _MOBILE):
        return "mobile"
    return "desktop"


def clip(value: str | None, limit: int) -> str | None:
    """Обрезает строку под длину колонки. Referrer длиной в километр — обычное
    дело, и без этого он ронял бы вставку на StringDataRightTruncation."""
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    return text[:limit]


async def record_visit(
    db: AsyncSession,
    *,
    anon_id: str,
    path: str,
    referrer: str | None,
    utm_source: str | None,
    utm_medium: str | None,
    utm_campaign: str | None,
    lang: str | None,
    country: str | None,
    device: str,
) -> bool:
    """Пишет визит. Возвращает False, если это повтор внутри окна."""
    since = datetime.utcnow() - timedelta(minutes=DEDUP_MINUTES)
    recent = (
        await db.execute(
            select(LandingVisit.id)
            .where(
                LandingVisit.anon_id == anon_id,
                LandingVisit.path == path,
                LandingVisit.created_at >= since,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if recent is not None:
        return False

    db.add(
        LandingVisit(
            anon_id=anon_id,
            path=path,
            referrer=clip(referrer, 300),
            utm_source=clip(utm_source, 100),
            utm_medium=clip(utm_medium, 100),
            utm_campaign=clip(utm_campaign, 100),
            lang=clip(lang, 5),
            country=country,
            device=device,
        )
    )
    await db.commit()
    return True
