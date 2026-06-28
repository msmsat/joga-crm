from typing import List, Optional
from sqlalchemy import Integer, String, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioBranch(Base):
    __tablename__ = "studio_branches"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="branches")
    working_hours: Mapped[List["BranchWorkingHours"]] = relationship(back_populates="branch", cascade="all, delete-orphan")
    halls: Mapped[List["Hall"]] = relationship(back_populates="branch")


class BranchWorkingHours(Base):
    __tablename__ = "branch_working_hours"
    __table_args__ = (UniqueConstraint("branch_id", "day_of_week", name="uq_branch_day"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("studio_branches.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    open_time: Mapped[str] = mapped_column(String(5))
    close_time: Mapped[str] = mapped_column(String(5))

    branch: Mapped["StudioBranch"] = relationship(back_populates="working_hours")
