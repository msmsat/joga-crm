from typing import Optional

from schemas._base import BaseSchema


class TokenResponse(BaseSchema):
    access_token: Optional[str] = None
    token_type: str
    message: Optional[str] = None
    two_fa_required: bool = False
