"""A local fiscal document exists only after its purchase has been paid."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BillingTaxDocument(Base):
    __tablename__ = "billing_tax_documents"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'issued')", name="ck_billing_tax_document_status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # Retain issued accounting history even if a user deletes their CRM data.
    invoice_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("billing_invoices.id", ondelete="RESTRICT"), unique=True,
    )
    studio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("studios.id", ondelete="RESTRICT"), index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    # Copy the purchase snapshot when paid. The issuing service enriches this
    # copy with the document number and FX evidence once; never edit after issued.
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # A full refund adds a separate correction; the issued original stays frozen.
    correction_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
