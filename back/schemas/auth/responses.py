from typing import Optional

from schemas._base import BaseSchema


class TokenResponse(BaseSchema):
    access_token: str
    token_type: str
    message: Optional[str] = None
