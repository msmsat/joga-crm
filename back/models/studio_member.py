from typing import Optional

from sqlalchemy import Float, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioMember(Base):
    """Участие человека в студии — и ВЕСЬ его профиль в ней.

    Аккаунт (`User`) глобальный: email, телефон и пароль — одни на весь продукт.
    Всё остальное, чем человек является внутри конкретной студии, живёт здесь:
    как его зовут в этой команде, его фото, роль, должность, ставка. Один тренер
    работает в двух студиях под разными именами, с разной ставкой и должностью,
    и владелец одной студии не переписывает ни его личный аккаунт, ни его
    профиль в другой студии. См. docs/ROADMAP_ACCOUNTS, решения 7 и 9.

    Поэтому студийные экраны (список сотрудников, журнал, отчёты, зарплаты)
    берут имя и фото ОТСЮДА, а не с `users`; `users.name` остаётся личным именем
    аккаунта — им человек подписан в своём профиле и в переключателе аккаунтов.
    """

    __tablename__ = "studio_members"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(50))

    # "pending" — приглашение отправлено, человек его ещё не принял; "active" —
    # принял и работает. Доступ к студии даёт только active: владелец не может
    # втащить чужой аккаунт в свою команду, зная лишь email (решение 10).
    #
    # Дефолт намеренно "pending": забытый статус на новом пути создания членства
    # должен обернуться лишним «ожидает», а не молчаливой выдачей доступа.
    status: Mapped[str] = mapped_column(String(20), default="pending")

    # Имя обязательно: каждое членство обязано знать, как показывать человека в
    # этой студии. При создании берётся либо из формы владельца, либо с аккаунта.
    name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    department: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    salary: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rate_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    user: Mapped["User"] = relationship(back_populates="studio_memberships")
    studio: Mapped["Studio"] = relationship(back_populates="members")

    __table_args__ = (
        UniqueConstraint("user_id", "studio_id", name="uq_studio_member"),
    )
