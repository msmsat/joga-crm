from datetime import date, datetime
from typing import Optional

from pydantic import model_validator

from schemas._base import BaseSchema


class PromoCodeRead(BaseSchema):
    id: int
    code: str
    discount_type: str  # percent / amount
    value: int
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    usage_limit: Optional[int] = None
    used_count: int
    is_active: bool
    created_at: datetime
    # Промокод выписан одному клиенту; null — общий. Имя — для списка кодов,
    # чтобы владелец видел, чей код, без второго запроса.
    client_id: Optional[int] = None
    client_name: Optional[str] = None


class PromoCodeCreate(BaseSchema):
    code: str
    discount_type: str = "percent"
    value: int
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None
    usage_limit: Optional[int] = None
    client_id: Optional[int] = None

    @model_validator(mode="after")
    def _check_period(self):
        # «С 10-го по 5-е» — код, который не действует ни дня: такой
        # период — опечатка, а не намерение.
        if self.valid_from and self.valid_until and self.valid_from > self.valid_until:
            raise ValueError("Дата начала позже даты окончания")
        return self


class PromoCodeCheck(BaseSchema):
    code: str
    amount: int
    # Для личного промокода — чей это чек; без клиента личный код не примется.
    client_id: Optional[int] = None


class PromoCodeCheckResult(BaseSchema):
    valid: bool
    discount: int = 0
    final_amount: int = 0
    detail: Optional[str] = None
