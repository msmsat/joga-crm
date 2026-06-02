from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import BigInteger, Integer, String, ForeignKey, DateTime, Date, func, CheckConstraint, Boolean, Column
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

# ==========================================
# 1. СТУДИЯ И АДМИНЫ (SaaS)
# ==========================================
class Studio(Base):
    __tablename__ = "studios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150))
    
    users: Mapped[List["User"]] = relationship(back_populates="studio")
    clients: Mapped[List["Client"]] = relationship(back_populates="studio")
    lessons: Mapped[List["Lesson"]] = relationship(back_populates="studio")

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(100))
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(50), default="admin")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    
    studio: Mapped["Studio"] = relationship(back_populates="users")

# ==========================================
# 2. КЛИЕНТЫ И B2C ЛОГИКА
# ==========================================
class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # 🔥 ИСПРАВЛЕНО: Добавлена привязка клиента к студии!
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    
    tg_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    
    registration_date: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    notifs_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # 🔥 ИСПРАВЛЕНО: Добавлена связь со студией
    studio: Mapped["Studio"] = relationship(back_populates="clients")
    
    # 🔥 ИСПРАВЛЕНО: back_populates теперь указывает на "client", а не "user"
    subscriptions: Mapped[List["ClientSubscription"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    payments: Mapped[List["ClientPayment"]] = relationship(back_populates="client", cascade="all, delete-orphan")

class ClientSubscription(Base):
    __tablename__ = "client_subscriptions" # 🔥 ИСПРАВЛЕНО имя таблицы

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    
    type: Mapped[str] = mapped_column(String(100)) 
    total_classes: Mapped[int] = mapped_column(Integer) 
    used_classes: Mapped[int] = mapped_column(Integer, default=0) 
    expires_at: Mapped[date] = mapped_column(Date) 
    status: Mapped[str] = mapped_column(String(20), default="active")

    # 🔥 ИСПРАВЛЕНО: имя переменной client совпадает с back_populates="client" в Client
    client: Mapped["Client"] = relationship(back_populates="subscriptions")

class ClientPayment(Base):
    __tablename__ = "client_payments" # 🔥 ИСПРАВЛЕНО имя таблицы
    __table_args__ = (CheckConstraint("status IN ('success', 'pending', 'failed')", name="check_payment_status"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    
    amount: Mapped[int] = mapped_column(Integer) 
    description: Mapped[str] = mapped_column(String(255)) 
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    action_type: Mapped[str] = mapped_column(String(50)) 
    item_key: Mapped[str] = mapped_column(String(50)) 

    # 🔥 ИСПРАВЛЕНО: связь с клиентом
    client: Mapped["Client"] = relationship(back_populates="payments")

class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # 🔥 ИСПРАВЛЕНО: Урок должен знать, в какой он студии!
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    
    name: Mapped[str] = mapped_column(String(100)) 
    teacher_name: Mapped[str] = mapped_column(String(100)) 
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    duration_min: Mapped[int] = mapped_column(Integer, default=60) 
    
    price: Mapped[int] = mapped_column(Integer) 
    level: Mapped[str] = mapped_column(String(50)) 
    equipment: Mapped[str] = mapped_column(String(50)) 
    total_spots: Mapped[int] = mapped_column(Integer, default=8) 

    # 🔥 ИСПРАВЛЕНО: Добавлена связь со студией
    studio: Mapped["Studio"] = relationship(back_populates="lessons")
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")

class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (CheckConstraint("status IN ('active', 'cancelled', 'attended')", name="check_reservation_status"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    
    spot_number: Mapped[int] = mapped_column(Integer) 
    status: Mapped[str] = mapped_column(String(20), default="active")
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True) 

    client: Mapped["Client"] = relationship(back_populates="reservations")
    lesson: Mapped["Lesson"] = relationship(back_populates="reservations")