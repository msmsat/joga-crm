from typing import Optional

from schemas._base import BaseSchema


class TokenResponse(BaseSchema):
    access_token: Optional[str] = None
    token_type: str
    message: Optional[str] = None
    two_fa_required: bool = False
    # Заполнен только при two_fa_required=True — фронт не всегда знает identifier
    # на этом шаге (вход через Google не спрашивает email/телефон формой).
    two_fa_identifier: Optional[str] = None
