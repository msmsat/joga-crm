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


class InviteInfoResponse(BaseSchema):
    """GET /auth/invite — что показать на странице по ссылке из письма.

    Пароль страница спрашивает всегда: ссылка — только первый фактор. Разница
    лишь в формулировке, её и задаёт `is_new_account`: True — аккаунт завела
    студия, и нужен пароль, который владелец передал сотруднику лично; False —
    у человека уже есть Velora, и нужен его собственный пароль.
    """
    email: str
    name: str
    studio_name: str
    studio_logo_url: Optional[str] = None
    role: str
    is_new_account: bool
    # Телефона у аккаунта нет — страница спросит его вместе с паролем: владелец
    # заводит сотрудника по одному email, а номер знает только сам сотрудник.
    needs_phone: bool


class StudioListItem(BaseSchema):
    """GET /auth/studios (EPIC 7, задача 3) — карточка студии в /select-crm."""
    id: int
    name: str
    role: str
    logo_url: Optional[str] = None
    is_current: bool
    members_count: int
    clients_count: int
