from datetime import date, datetime
from typing import Optional

from schemas._base import BaseSchema


class CertificateConfigRead(BaseSchema):
    is_enabled: bool
    cert_type: str
    expiry_days: int
    denominations: Optional[list[int]] = None
    service_id: Optional[int] = None


class CertificateConfigUpdate(BaseSchema):
    is_enabled: Optional[bool] = None
    cert_type: Optional[str] = None
    expiry_days: Optional[int] = None
    denominations: Optional[list[int]] = None
    service_id: Optional[int] = None


class GiftCertificateRead(BaseSchema):
    id: int
    code: str
    amount: int
    cert_type: str
    status: str  # active / used / expired
    recipient_name: Optional[str] = None
    issued_at: datetime
    expires_at: Optional[date] = None


class GiftCertificateCreate(BaseSchema):
    amount: int
    cert_type: str
    recipient_name: Optional[str] = None
    client_id: Optional[int] = None
    expires_at: Optional[date] = None
    account_id: Optional[int] = None
