from sqlalchemy import Integer, ForeignKey, Table, Column
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


user_services = Table(
    "user_services",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", Integer, ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
)
