from sqlalchemy import CheckConstraint, Integer, ForeignKey, Table, Column
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


user_services = Table(
    "user_services",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", Integer, ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    # Индивидуальная цена услуги У ЭТОГО мастера. NULL — «как у услуги», и это
    # НЕ то же самое, что копия базовой цены в момент назначения: скопированная
    # цена перестала бы слышать правку Каталога, и владелец, поднявший ценник
    # услуги, поднял бы его только новым мастерам. Ноль — законное значение
    # («бесплатно у стажёра»), поэтому снятие своей цены пишется именно NULL.
    # Читать и писать — только через services/service_pricing.py.
    Column("price", Integer, nullable=True),
    CheckConstraint("price IS NULL OR price >= 0", name="check_user_services_price_non_negative"),
)
