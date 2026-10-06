"""Stable identities for an opt-in setup, independent of editable display names."""
from sqlalchemy import ForeignKey, String, UniqueConstraint, Integer
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class StudioSetupLink(Base):
    __tablename__ = 'studio_setup_links'
    __table_args__ = (UniqueConstraint('studio_id', 'preset', 'key', name='uq_studio_setup_key'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey('studios.id', ondelete='CASCADE'), index=True)
    preset: Mapped[str] = mapped_column(String(50))
    key: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[int] = mapped_column(Integer)
