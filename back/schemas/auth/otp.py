from typing import Literal

from schemas._base import BaseSchema

# delete_account — удаление СТУДИИ (Настройки → Безопасность), delete_user —
# удаление личного аккаунта вместе с почтой (Профиль). Разные скоупы, потому
# что код, полученный под одно, не должен подтверждать другое: подтверждая
# удаление студии, человек не соглашался стереть свой аккаунт.
OtpAction = Literal["change_password", "delete_data", "delete_account", "delete_user", "enable_2fa", "login_2fa"]


class OtpRequestIn(BaseSchema):
    action: OtpAction


class OtpRequestOut(BaseSchema):
    expires_in: int


class OtpVerifyIn(BaseSchema):
    action: OtpAction
    code: str


class OtpVerifyOut(BaseSchema):
    otp_token: str
