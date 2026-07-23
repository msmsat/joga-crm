from datetime import date, datetime
from typing import Literal, Optional

from schemas._base import BaseSchema


class OperationRead(BaseSchema):
    id: int
    type: str
    title: str
    amount: int
    op_date: date
    category: Optional[str] = None
    method: Optional[str] = None
    status: str
    client_id: Optional[int] = None
    account_id: Optional[int] = None
    counterparty_id: Optional[int] = None
    trainer_id: Optional[int] = None


class OperationCreate(BaseSchema):
    type: Literal["in", "out"]
    title: str
    amount: int
    op_date: date
    category: Optional[str] = None
    method: Optional[str] = None
    account_id: Optional[int] = None
    client_id: Optional[int] = None
    counterparty_id: Optional[int] = None


class OperationUpdate(BaseSchema):
    title: Optional[str] = None
    amount: Optional[int] = None
    op_date: Optional[date] = None
    category: Optional[str] = None
    method: Optional[str] = None
    account_id: Optional[int] = None
    client_id: Optional[int] = None
    counterparty_id: Optional[int] = None


class MethodStat(BaseSchema):
    method: str  # ключ метода ("" → «не указан», обрабатывает фронт)
    amount: int
    count: int


class CategoryStat(BaseSchema):
    category: str  # "other" → без категории, обрабатывает фронт
    amount: int


class CounterpartyRead(BaseSchema):
    id: int
    name: str
    counterparty_type: str
    inn: Optional[str] = None
    category: Optional[str] = None
    balance: int
    deals_count: int


class CounterpartyCreate(BaseSchema):
    name: str
    counterparty_type: str
    inn: Optional[str] = None
    category: Optional[str] = None


class CounterpartyUpdate(BaseSchema):
    name: Optional[str] = None
    counterparty_type: Optional[str] = None
    inn: Optional[str] = None
    category: Optional[str] = None


class FinDocumentRead(BaseSchema):
    id: int
    title: str
    doc_type: str
    amount: Optional[int] = None
    status: str
    file_ext: str
    has_file: bool = False
    counterparty_id: Optional[int] = None
    created_at: datetime


class FinDocumentCreate(BaseSchema):
    title: str
    doc_type: str
    file_ext: Optional[str] = None
    amount: Optional[int] = None
    status: Optional[str] = None
    counterparty_id: Optional[int] = None


class FinDocumentUpdate(BaseSchema):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    amount: Optional[int] = None
    status: Optional[str] = None
    counterparty_id: Optional[int] = None
