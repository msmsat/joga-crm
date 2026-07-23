from typing import Literal, Optional

from schemas._base import BaseSchema

GatewayType = Literal["stripe", "fondy"]


class GatewayRead(BaseSchema):
    gateway_type: GatewayType
    connected: bool
    is_active: bool
    public_key: Optional[str] = None


class GatewayUpdate(BaseSchema):
    public_key: Optional[str] = None
    secret_key: Optional[str] = None
    is_active: Optional[bool] = None
