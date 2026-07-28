from typing import Literal

from schemas._base import BaseSchema

OtpAction = Literal["change_password", "delete_data", "delete_account", "enable_2fa", "login_2fa"]


class OtpRequestIn(BaseSchema):
    action: OtpAction


class OtpRequestOut(BaseSchema):
    expires_in: int


class OtpVerifyIn(BaseSchema):
    action: OtpAction
    code: str


class OtpVerifyOut(BaseSchema):
    otp_token: str
