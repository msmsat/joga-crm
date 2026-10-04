"""Imported source history, isolated from payable native bookings and cash."""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, JSON, DateTime, ForeignKey, UniqueConstraint, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class BumpixClient(Base):
    __tablename__ = 'bumpix_clients'
    __table_args__ = (
        UniqueConstraint('studio_id', 'account_key', 'source_client_id', name='uq_bumpix_client_source'),
        UniqueConstraint('studio_id', 'account_key', 'client_id', name='uq_bumpix_client_target'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey('studios.id', ondelete='CASCADE'), index=True)
    account_key: Mapped[str] = mapped_column(String(64))
    source_client_id: Mapped[str] = mapped_column(String(33))
    client_id: Mapped[int] = mapped_column(ForeignKey('clients.id', ondelete='CASCADE'), index=True)
    snapshot_id: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    managed_values: Mapped[dict] = mapped_column(JSON)
    note_id: Mapped[Optional[int]] = mapped_column(ForeignKey('client_notes.id', ondelete='SET NULL'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class BumpixSnapshot(Base):
    __tablename__ = 'bumpix_snapshots'
    __table_args__ = (UniqueConstraint('binding_id', 'snapshot_id', name='uq_bumpix_snapshot'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    binding_id: Mapped[int] = mapped_column(ForeignKey('bumpix_clients.id', ondelete='CASCADE'), index=True)
    snapshot_id: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class BumpixEvent(Base):
    __tablename__ = 'bumpix_events'
    __table_args__ = (
        UniqueConstraint('studio_id', 'account_key', 'source_event_id', name='uq_bumpix_event_source'),
        CheckConstraint("status IN ('new','completed','canceled')", name='ck_bumpix_event_status'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey('studios.id', ondelete='CASCADE'), index=True)
    account_key: Mapped[str] = mapped_column(String(64))
    binding_id: Mapped[int] = mapped_column(ForeignKey('bumpix_clients.id', ondelete='CASCADE'), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey('clients.id', ondelete='CASCADE'), index=True)
    source_event_id: Mapped[str] = mapped_column(String(33))
    master_source_id: Mapped[str] = mapped_column(String(33))
    teacher_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime)
    end_time: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20))
    groups: Mapped[list] = mapped_column(JSON)
    group_mask: Mapped[int] = mapped_column()
    payload: Mapped[dict] = mapped_column(JSON)
    income: Mapped[str] = mapped_column(Text)
    outlay: Mapped[str] = mapped_column(Text)
    is_current: Mapped[bool] = mapped_column(default=True)


class BumpixMedia(Base):
    __tablename__ = 'bumpix_media'
    __table_args__ = (
        UniqueConstraint('binding_id', 'kind', 'source_owner_id', 'image_id', 'revision', name='uq_bumpix_media_identity'),
        CheckConstraint("(kind='avatar' AND event_id IS NULL) OR (kind='event' AND event_id IS NOT NULL)", name='ck_bumpix_media_owner'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey('studios.id', ondelete='CASCADE'), index=True)
    binding_id: Mapped[int] = mapped_column(ForeignKey('bumpix_clients.id', ondelete='CASCADE'), index=True)
    event_id: Mapped[Optional[int]] = mapped_column(ForeignKey('bumpix_events.id', ondelete='CASCADE'), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(10))
    source_owner_id: Mapped[str] = mapped_column(String(33))
    image_id: Mapped[str] = mapped_column(String(50))
    revision: Mapped[str] = mapped_column(String(40))
    path: Mapped[str] = mapped_column(String(300))
    sha256: Mapped[str] = mapped_column(String(64))
    bytes: Mapped[int] = mapped_column()
    is_current: Mapped[bool] = mapped_column(default=True)


class BumpixJournalLink(Base):
    """Stable projection identity; NULL target means deleted, never recreate it."""
    __tablename__ = 'bumpix_journal_links'
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey('bumpix_events.id', ondelete='CASCADE'), unique=True)
    lesson_id: Mapped[Optional[int]] = mapped_column(ForeignKey('lessons.id', ondelete='SET NULL'), nullable=True, unique=True)
    reservation_id: Mapped[Optional[int]] = mapped_column(ForeignKey('reservations.id', ondelete='SET NULL'), nullable=True, unique=True)
    note_id: Mapped[Optional[int]] = mapped_column(ForeignKey('client_notes.id', ondelete='SET NULL'), nullable=True, unique=True)
    managed_values: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class BumpixServiceLink(Base):
    __tablename__ = 'bumpix_service_links'
    __table_args__ = (UniqueConstraint('studio_id', 'account_key', 'source_key', name='uq_bumpix_service_source'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey('studios.id', ondelete='CASCADE'), index=True)
    account_key: Mapped[str] = mapped_column(String(64))
    source_key: Mapped[str] = mapped_column(Text)
    service_id: Mapped[Optional[int]] = mapped_column(ForeignKey('services.id', ondelete='SET NULL'), nullable=True)
