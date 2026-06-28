from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioMember(Base):
    __tablename__ = "studio_members"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(50))

    user: Mapped["User"] = relationship(back_populates="studio_memberships")
    studio: Mapped["Studio"] = relationship(back_populates="members")

    __table_args__ = (
        UniqueConstraint("user_id", "studio_id", name="uq_studio_member"),
    )
