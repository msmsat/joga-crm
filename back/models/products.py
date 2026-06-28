from datetime import datetime
from typing import List, Optional
from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    product_type: Mapped[str] = mapped_column(String(30))
    price: Mapped[int] = mapped_column(Integer)
    unit_label: Mapped[str] = mapped_column(String(30), default="шт")
    badge_type: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    studio: Mapped["Studio"] = relationship(back_populates="products")
    sales: Mapped[List["ProductSale"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class ProductSale(Base):
    __tablename__ = "product_sales"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    operation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("operations.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    amount: Mapped[int] = mapped_column(Integer)
    payment_method: Mapped[str] = mapped_column(String(30))
    is_new_client: Mapped[bool] = mapped_column(Boolean, default=False)
    sold_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    product: Mapped[Optional["Product"]] = relationship(back_populates="sales")
    client: Mapped[Optional["Client"]] = relationship()
    operation: Mapped[Optional["Operation"]] = relationship()
