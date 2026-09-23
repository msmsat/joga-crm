from typing import Optional, Literal
from pydantic import EmailStr, Field, field_validator

from schemas._base import BaseSchema, NormEmail, OptPhone
from schemas.auth.requests import validate_strong_password
from schemas.staff.staff import StaffWorkingHoursItem


class StaffServicePrice(BaseSchema):
    """Индивидуальная цена одной услуги у сотрудника.

    `price=None` — «как у услуги»: цена продолжит ездить за правкой Каталога.
    Ноль — законная цена (бесплатно у стажёра), и путать её со снятием нельзя.
    """
    service_id: int
    price: Optional[int] = Field(default=None, ge=0)


class StaffCreate(BaseSchema):
    name: str
    last_name: Optional[str] = None
    email: NormEmail
    # Телефона у владельца при заведении сотрудника может не быть — его спросят
    # у самого сотрудника на странице приглашения (routers/auth/invite.py).
    phone: OptPhone = None
    # Пароль задаёт ВЛАДЕЛЕЦ и передаёт сотруднику лично (не письмом!).
    # Это второй фактор к ссылке из почты: одного перехваченного письма для входа
    # в студию мало — нужен ещё и пароль, о котором договорились вне канала.
    #
    # None допустим ровно в одном случае: email принадлежит уже существующему
    # аккаунту — тогда человек войдёт своим паролем, а чужой ему не задают.
    # Роутер это и проверяет: нет аккаунта и нет пароля → 400.
    password: Optional[str] = None
    role: Literal["admin", "trainer"]

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: Optional[str]) -> Optional[str]:
        return validate_strong_password(value) if value else value
    department: Optional[str] = None
    salary: Optional[float] = None
    rate: Optional[float] = None
    rate_type: Optional[str] = None  # "fixed" | "percent" | "hourly"
    service_ids: list[int] = []
    # Цены только для тех услуг, где они отличаются от базовой. Услуги,
    # которой нет в `service_ids`, тут быть не может — это ошибка клиента, а не
    # «назначить заодно»: иначе список услуг получил бы второй источник правды.
    # Поле не прислали — цены не трогаем; прислали пустым — снимаем все.
    service_prices: list[StaffServicePrice] = []
    photo_url: Optional[str] = None
    schedule: list[StaffWorkingHoursItem] = []
    # HB-05: филиалы, где сотрудник доступен для Resource-записи.
    branch_ids: list[int] = []


class StaffUpdate(BaseSchema):
    name: str
    last_name: Optional[str] = None
    email: NormEmail
    phone: OptPhone = None
    # None → роль не меняется. Так правится владелец: его "owner" в Literal не входит,
    # и промахнуться с понижением до admin/trainer нельзя.
    role: Optional[Literal["admin", "trainer"]] = None
    department: Optional[str] = None
    salary: Optional[float] = None
    rate: Optional[float] = None
    rate_type: Optional[str] = None
    service_ids: list[int] = []
    # Цены только для тех услуг, где они отличаются от базовой. Услуги,
    # которой нет в `service_ids`, тут быть не может — это ошибка клиента, а не
    # «назначить заодно»: иначе список услуг получил бы второй источник правды.
    # Поле не прислали — цены не трогаем; прислали пустым — снимаем все.
    service_prices: list[StaffServicePrice] = []
    photo_url: Optional[str] = None
    schedule: list[StaffWorkingHoursItem] = []
    branch_ids: list[int] = []


class StaffMessageRequest(BaseSchema):
    text: str
    channel: str  # "whatsapp" | "telegram" | "email"


class StaffCallRequest(BaseSchema):
    channel: str  # "phone" | "whatsapp"
