from typing import Optional
from pydantic import EmailStr, Field, model_validator
from schemas._base import BaseSchema
from schemas.schedule.hybrid import ServiceBookingMode, TerminologyProfile


class StudioRead(BaseSchema):
    id: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None
    business_type: Optional[str] = None
    business_subtype: Optional[str] = None
    description: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    currency: Optional[str] = None
    date_format: Optional[str] = None
    first_day_of_week: Optional[str] = None


class BranchCreate(BaseSchema):
    name: str
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None

    @model_validator(mode="after")
    def _require_contact(self) -> "BranchCreate":
        if not self.phone and not self.email:
            raise ValueError("Укажите телефон или email")
        return self


class WorkingHoursWrite(BaseSchema):
    day_of_week: int   # 0=Пн … 6=Вс
    is_open: bool
    open_time: str     # "HH:MM"
    close_time: str    # "HH:MM"


class BranchUpdate(BaseSchema):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    working_hours: Optional[list[WorkingHoursWrite]] = None

    @model_validator(mode="after")
    def _validate_working_hours(self) -> "BranchUpdate":
        if self.working_hours is None:
            return self
        days = [wh.day_of_week for wh in self.working_hours]
        if sorted(days) != list(range(7)):
            raise ValueError("working_hours должен содержать все 7 дней (0–6) без повторов")
        for wh in self.working_hours:
            if wh.is_open and wh.open_time >= wh.close_time:
                raise ValueError("Время открытия должно быть раньше времени закрытия")
        return self


class BranchListItem(BaseSchema):
    id: int
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    hall_count: int = 0


class HallBrief(BaseSchema):
    id: int
    name: str
    capacity: int
    color: Optional[str] = None
    area: Optional[float] = None
    hourly_rate: Optional[float] = None
    equipment: Optional[list] = None
    is_online: bool = False
    photo_url: Optional[str] = None


class WorkingHoursRead(BaseSchema):
    day_of_week: int
    is_open: bool
    open_time: str
    close_time: str


class ServiceMasterRead(BaseSchema):
    user_id: int
    name: str
    price: int
    # Сколько услуга длится у этого мастера, в минутах.
    duration_min: int = 0


class ServiceBundlePartRead(BaseSchema):
    """Часть комплекса — ровно то, что нужно показать в составе, без второго
    похода за услугой: название, время, цена «от–до» и цвет точки."""
    service_id: int
    name: str
    duration_min: int
    price_min: int
    price_max: int
    color: Optional[str] = None


class ServiceRefRead(BaseSchema):
    id: int
    name: str


class ServiceRead(BaseSchema):
    id: int
    name: str
    description: Optional[str] = None
    price: int
    # Во что услуга обходится клиенту с поправкой на мастера: у одной услуги у
    # разных мастеров цена своя (services/service_pricing.py). Совпали — экран
    # пишет одну сумму, разошлись — «от price_min до price_max». Считает это
    # сервер: два числа сравнивает он, а не каждый экран по-своему, иначе
    # продукт рано или поздно напишет «от 500 до 500».
    #
    # Диапазон идёт по МАСТЕРАМ услуги, а не от базовой цены: если по базовой
    # не работает никто, показывать её клиенту — обещать несуществующее. Услугу
    # не ведёт никто → оба числа равны `price`.
    price_min: int = 0
    price_max: int = 0
    # Кто оказывает услугу и во что она у него обходится. Нужен Журналу: тренер
    # там задан колонкой сетки, то есть известен ДО того, как форма открылась, —
    # и цена должна встать его, а не усреднённая. Список короткий (мастера
    # одной услуги), отдельной ручки под него не заводим: ходить за ценой
    # второй раз на каждое открытие формы дороже, чем привезти её сразу.
    masters: list["ServiceMasterRead"] = []
    duration_min: int
    # Длительность «от–до» по мастерам услуги — то же правило, что у цены.
    # Совпали — одно число, разошлись — «duration_from–duration_to мин».
    duration_from: int = 0
    duration_to: int = 0
    category: Optional[str] = None
    service_type: Optional[str] = None
    color: Optional[str] = None
    max_clients: Optional[int] = None
    bookings_count: int
    revenue_total: int
    bookings_last_30d: int = 0
    # HB-02/03: механика записи. `service_type` (group/individual) остаётся
    # форматом обслуживания и не выводит booking_mode — они читаются отдельно.
    booking_mode: ServiceBookingMode = "event"
    buffer_before_min: int = 0
    buffer_after_min: int = 0
    is_bookable: bool = True
    terminology_profile: Optional[TerminologyProfile] = None
    # Комплекс (services/service_bundles.py): части по порядку. Пусто — это
    # обычная услуга. bundle_full_price — «по отдельности», только когда
    # комплекс действительно выгоднее; in_bundles — куда входит эта услуга.
    bundle_items: list[ServiceBundlePartRead] = []
    bundle_full_price: Optional[int] = None
    in_bundles: list[ServiceRefRead] = []


def reject_resource_group_combo(service_type: Optional[str], booking_mode: Optional[str]) -> None:
    if booking_mode == "resource" and service_type == "group":
        raise ValueError("resource-услуга не может быть групповой (service_type=group)")


class ServiceCreate(BaseSchema):
    name: str = Field(min_length=1, max_length=150)
    price: int = Field(ge=0)
    duration_min: int = Field(60, ge=1)
    description: Optional[str] = None
    category: Optional[str] = None
    service_type: Optional[str] = None
    color: Optional[str] = None
    max_clients: Optional[int] = None
    booking_mode: ServiceBookingMode = "event"
    buffer_before_min: int = Field(0, ge=0, le=240)
    buffer_after_min: int = Field(0, ge=0, le=240)
    is_bookable: bool = True
    terminology_profile: Optional[TerminologyProfile] = None
    # Задан — создаётся комплекс из этих услуг (по порядку выполнения).
    bundle_service_ids: Optional[list[int]] = None

    @model_validator(mode="after")
    def _validate_resource_shape(self) -> "ServiceCreate":
        reject_resource_group_combo(self.service_type, self.booking_mode)
        if self.booking_mode == "resource" and not (1 <= self.duration_min <= 1440):
            raise ValueError("длительность resource-услуги должна быть от 1 до 1440 минут")
        return self


class ServiceUpdate(BaseSchema):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    price: Optional[int] = Field(None, ge=0)
    duration_min: Optional[int] = Field(None, ge=1)
    description: Optional[str] = None
    category: Optional[str] = None
    service_type: Optional[str] = None
    color: Optional[str] = None
    max_clients: Optional[int] = None
    booking_mode: Optional[ServiceBookingMode] = None
    buffer_before_min: Optional[int] = Field(None, ge=0, le=240)
    buffer_after_min: Optional[int] = Field(None, ge=0, le=240)
    is_bookable: Optional[bool] = None
    terminology_profile: Optional[TerminologyProfile] = None
    @model_validator(mode="after")
    def _required_values_not_null(self) -> "ServiceUpdate":
        for field in ("name", "price", "duration_min", "booking_mode", "buffer_before_min", "buffer_after_min", "is_bookable"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} не может быть null")
        return self

    # Новый состав комплекса целиком. Обычную услугу комплексом не делает:
    # её история записей относится к одной процедуре, а не к набору.
    bundle_service_ids: Optional[list[int]] = None


class ServiceWeekSlot(BaseSchema):
    day_of_week: int   # 0=Пн … 6=Вс (текущая неделя)
    hour: int          # час начала занятия (0-23)


class BranchDetail(BaseSchema):
    id: int
    name: str
    country: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    halls: list[HallBrief] = []
    working_hours: list[WorkingHoursRead] = []
