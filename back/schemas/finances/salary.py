from datetime import date, datetime
from typing import Optional

from schemas._base import BaseSchema


class SalaryRead(BaseSchema):
    id: int
    user_id: int
    period_start: date
    period_end: date
    sessions_count: int
    amount: int
    status: str
    paid_at: Optional[datetime] = None


class SalaryRow(BaseSchema):
    """Строка расчёта зарплаты за период: считается на лету по занятиям и ставке.
    status: 'paid' если за период уже есть выплата, иначе 'pending'."""
    user_id: int
    name: str
    sessions_count: int
    hours_worked: float
    lessons_revenue: int
    rate: Optional[float] = None
    rate_type: Optional[str] = None
    amount: int
    status: str
    paid_at: Optional[datetime] = None


class SalaryPayRequest(BaseSchema):
    period_start: date
    period_end: date
