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
    # Индивидуальная длительность услуги у мастера, в минутах. Правила те же,
    # что у цены (NULL — «как у услуги»), кроме нуля: услуга без длительности
    # не занимает времени мастера, и слот под неё встал бы поверх любой записи.
    # Читать и писать — только через services/service_pricing.py.
    Column("duration_min", Integer, nullable=True),
    CheckConstraint("price IS NULL OR price >= 0", name="check_user_services_price_non_negative"),
    CheckConstraint(
        "duration_min IS NULL OR (duration_min >= 1 AND duration_min <= 1440)",
        name="check_user_services_duration_range",
    ),
)
