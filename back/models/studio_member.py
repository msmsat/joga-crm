from typing import Optional

from sqlalchemy import Float, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioMember(Base):
    """Участие человека в студии. Аккаунт (`User`) глобальный — один email на весь
    продукт, — а всё, что у сотрудника своё В КОНКРЕТНОЙ студии, живёт здесь.

    Поэтому ставка, должность и роль — колонки этой таблицы, а не `users`: один
    тренер работает в двух студиях с разной ставкой и разной должностью, и
    владелец одной студии не должен переписывать его условия в другой.
    См. docs/ROADMAP_ACCOUNTS, решение 7.
    """

    __tablename__ = "studio_members"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(50))

    department: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    salary: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rate_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    user: Mapped["User"] = relationship(back_populates="studio_memberships")
    studio: Mapped["Studio"] = relationship(back_populates="members")

    __table_args__ = (
        UniqueConstraint("user_id", "studio_id", name="uq_studio_member"),
    )
