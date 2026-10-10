"""Именованные скидки студии (DiscountCampaign) — см. models/loyalty.py."""
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import Field, field_validator, model_validator

from schemas._base import BaseSchema

SegmentKey = Literal["new", "vip", "active", "inactive", "has_subscription", "birthday"]


def _unique(values: list) -> list:
    """Повтор в списке — опечатка формы, а не намерение: порядок сохраняем."""
    return list(dict.fromkeys(values))


class DiscountCampaignCreate(BaseSchema):
    name: str = Field(..., max_length=80)
    discount_type: Literal["percent", "amount"] = "percent"
    value: int = Field(..., ge=1)
    # Период «с … по …», обе даты включительно; пусто — без границы.
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    # На что: на всё или на выбранные услуги (их занятия) и абонементы.
    applies_to: Literal["all", "selected"] = "all"
    service_ids: list[int] = []
    package_ids: list[int] = []
    # Кому: всем, группам клиентов или отдельным клиентам.
    audience: Literal["all", "segments", "clients"] = "all"
    segments: list[SegmentKey] = []
    client_ids: list[int] = []
    # Именинники: окно «за N дней до и N после» дня рождения.
    birthday_window_days: int = Field(3, ge=0, le=30)
    min_purchase_amount: Optional[int] = Field(default=None, ge=1)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Назовите скидку")
        return value

    @field_validator("service_ids", "package_ids", "segments", "client_ids")
    @classmethod
    def _dedupe(cls, value: list) -> list:
        return _unique(value)

    @model_validator(mode="after")
    def _consistent(self):
        if self.discount_type == "percent" and self.value > 100:
            raise ValueError("Процент скидки — от 1 до 100")
        # «С 10-го по 5-е» — скидка, которая не действует ни дня: опечатка.
        if self.valid_from and self.valid_until and self.valid_from > self.valid_until:
            raise ValueError("Дата начала позже даты окончания")
        # Выбрать «на выбранное» и не выбрать ничего — скидка, которая не
        # сработает нигде; молча сохранить её значило бы обмануть владельца.
        if self.applies_to == "selected" and not (self.service_ids or self.package_ids):
            raise ValueError("Выберите услуги или абонементы")
        if self.audience == "segments" and not self.segments:
            raise ValueError("Выберите группы клиентов")
        if self.audience == "clients" and not self.client_ids:
            raise ValueError("Выберите клиентов")
        return self


class DiscountCampaignUpdate(BaseSchema):
    """Частичная правка. Согласованность итога проверяет роутер, собирая из
    строки и правки DiscountCampaignCreate: «на выбранное» без выбранного
    нельзя получить и по частям."""
    name: Optional[str] = Field(default=None, max_length=80)
    discount_type: Optional[Literal["percent", "amount"]] = None
    value: Optional[int] = Field(default=None, ge=1)
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    applies_to: Optional[Literal["all", "selected"]] = None
    service_ids: Optional[list[int]] = None
    package_ids: Optional[list[int]] = None
    audience: Optional[Literal["all", "segments", "clients"]] = None
    segments: Optional[list[SegmentKey]] = None
    client_ids: Optional[list[int]] = None
    birthday_window_days: Optional[int] = Field(default=None, ge=0, le=30)
    min_purchase_amount: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None


class DiscountClient(BaseSchema):
    id: int
    name: str


class DiscountCampaignRead(BaseSchema):
    id: int
    name: str
    discount_type: str
    value: int
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    applies_to: str
    service_ids: list[int]
    package_ids: list[int]
    audience: str
    segments: list[str]
    client_ids: list[int]
    # Имена выбранных клиентов — для карточки и редактора без второго запроса.
    clients: list[DiscountClient] = []
    birthday_window_days: int
    min_purchase_amount: Optional[int] = None
    is_active: bool
    used_count: int
    created_at: datetime
    # active / scheduled / ended / paused — по часам студии (services/discount_campaigns.status).
    status: str = "active"


class DiscountReachRead(BaseSchema):
    """Охват групп: сколько клиентов в каждой и во всех выбранных вместе."""
    clients: int
    total: int
    segments: dict[str, int]
