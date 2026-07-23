from schemas._base import BaseSchema


class SubscriptionSaleCreate(BaseSchema):
    """Продажа пакета абонемента клиенту (задача 5b)."""
    package_id: int
    account_id: int | None = None
    payment_method: str = ""
    promo_code: str | None = None


class ClientSubscriptionRead(BaseSchema):
    id: int
    type: str
    total_classes: int
    used_classes: int
    remaining: int
    expires_at: str
    status: str
    is_frozen: bool


class ClientWallet(BaseSchema):
    """GET /clients/{id}/wallet (CL-6.5). «Разовые» — пустой список до первой
    покупки разового через кассу (CL-6.9), отдельной сущности в MVP нет."""
    active: list[ClientSubscriptionRead]
    archived: list[ClientSubscriptionRead]


class SubscriptionTransferRequest(BaseSchema):
    """Передача абонемента другому клиенту (V5-7, Блок 4.1)."""
    target_client_id: int
