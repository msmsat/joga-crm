"""Данные о продукте как о бизнесе: кто пришёл на лендинг.

Отдельный файл, а не `analytics.py`: там метрики КОНКРЕТНОЙ студии, здесь —
метрики платформы. У этих таблиц нет ни общего ключа, ни общего потребителя,
и складывать их в один модуль значило бы путать два разных смысла слова
«аналитика».
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class LandingVisit(Base):
    """Один заход на лендинг.

    `ip` — адрес посетителя. Он здесь по прямому требованию владельца продукта:
    смотреть заходы поимённо, а не верить итоговым числам. Это персональные
    данные (в ЕС адрес считается таковым), поэтому колонка заполняется только
    для лендинга и нигде больше не показывается, кроме панели платформы.

    `anon_id` — идентификатор браузера из localStorage. Он же уезжает в
    `users.signup_anon_id` при регистрации, и на этом держится вся воронка:
    без него визит и аккаунт остаются двумя несвязанными фактами.
    """

    __tablename__ = "landing_visits"
    __table_args__ = (
        # Составной индекс под дедупликацию: «был ли этот же браузер на этом же
        # пути за последние 30 минут» — самый частый запрос к таблице.
        Index("ix_landing_visits_anon_path_time", "anon_id", "path", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    anon_id: Mapped[str] = mapped_column(String(64), index=True)
    path: Mapped[str] = mapped_column(String(200))
    referrer: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    utm_source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    utm_medium: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    utm_campaign: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    # Регион и город по адресу (DB-IP City Lite). NULL — база не знала места
    # или адреса не было вовсе; догадка сюда не подставляется.
    region: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    # 45 символов — предел IPv6 с зоной, самый длинный возможный адрес.
    ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    device: Mapped[str] = mapped_column(String(10), default="unknown", server_default="unknown")
    lang: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), index=True
    )
