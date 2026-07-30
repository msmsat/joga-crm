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

    `needs_password=True` — аккаунта у человека ещё не было, страница просит
    ПРИДУМАТЬ пароль. False — аккаунт в продукте уже есть, и страница просит
    ВВЕСТИ существующий: приглашение не должно открывать чужой аккаунт тому,
    кому просто переслали письмо.
    """
    email: str
    name: str
    studio_name: str
    studio_logo_url: Optional[str] = None
    role: str
    needs_password: bool


class StudioListItem(BaseSchema):
    """GET /auth/studios (EPIC 7, задача 3) — карточка студии в /select-crm."""
    id: int
    name: str
    role: str
    logo_url: Optional[str] = None
    is_current: bool
    members_count: int
    clients_count: int
