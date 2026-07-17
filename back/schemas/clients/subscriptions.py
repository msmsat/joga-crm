from schemas._base import BaseSchema


class SubscriptionSaleCreate(BaseSchema):
    """Продажа пакета абонемента клиенту (задача 5b)."""
    package_id: int
    account_id: int
    payment_method: str = ""


class ClientSubscriptionRead(BaseSchema):
    id: int
    type: str
    total_classes: int
    used_classes: int
    remaining: int
    expires_at: str
    status: str
    is_frozen: bool
