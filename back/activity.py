from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models import ActivityLog

# Цвет ленты по типу события — совпадает с палитрой дизайн-системы.
_COLORS = {
    "operation": "#A3C9A8",   # деньги — фисташковый
    "client": "#FCAE91",      # новый клиент — персиковый
    "booking": "#9BB8E8",     # запись — спокойный синий
}


def log_activity(
    db: AsyncSession,
    studio_id: int,
    event_type: str,
    title: str,
    actor_name: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
) -> None:
    """Добавляет запись в ленту событий студии в сессию вызывающего.
    Коммит — на стороне вызывающего: событие и его причина в одной транзакции."""
    db.add(ActivityLog(
        studio_id=studio_id,
        event_type=event_type,
        title=title,
        actor_name=actor_name,
        entity_type=entity_type,
        entity_id=entity_id,
        color=_COLORS.get(event_type),
    ))
