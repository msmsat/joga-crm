"""Типы гибридной записи (HB-03), docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §6.1/§6.3.

Два слоя типов:

  * `BookingCapabilities` — безопасный read-блок конфигурации студии. Отдаётся
    и в CRM (`GET /settings/general`), и в Mini-app (`GET /global/studio`) —
    один источник формы данных, а не две независимые копии полей.
  * `EventQuoteRequest`/`ResourceQuoteRequest` — дискриминированный запрос
    quote по `booking_mode` (§6.3). Формы описаны здесь заранее, чтобы HB-09/13
    не придумывали контракт по месту; сами ручки `/global/booking-quotes` и
    `/schedule/booking-quotes` появляются позже. `extra='forbid'` обязателен
    для всех схем этого файла — лишнее поле в запросе (например, клиентская
    цена или длительность) обязано быть отклонено, а не тихо проигнорировано.
"""
from datetime import date, datetime
from typing import Annotated, Literal, Optional, Union

from pydantic import ConfigDict, Field

from schemas._base import BaseSchema

# Studio.booking_mode — управляет каталогом целиком.
BookingMode = Literal["event", "resource", "hybrid"]
# Service.booking_mode — resource+group запрещена отдельным правилом (§6.1),
# поэтому у услуги нет "hybrid": одна услуга — один сценарий.
ServiceBookingMode = Literal["event", "resource"]
TerminologyProfile = Literal["generic", "fitness", "beauty"]

# Готовность САМОГО КОДА к режиму, а не разрешение конкретной студии. Открыто
# после HB-07 (единый замок закрыл обходы) и HB-24 (аудит наследия + проверки
# включения под замком): `services/hybrid_audit.assert_can_activate` не даст
# завести resource, пока у студии выключено строгое расписание или в будущем
# расписании остались неизвестные зоны и пересечения. Само по себе это
# множество ничего не включает — оно лишь перестало запрещать.
AVAILABLE_BOOKING_MODES: frozenset[str] = frozenset({"event", "resource", "hybrid"})


class HybridSchema(BaseSchema):
    """Общий предок новых схем гибридной записи — extra='forbid' по протоколу."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="forbid")


class BookingCapabilities(HybridSchema):
    """Безопасный блок: ни контактов, ни финансов — только то, что нужно
    клиенту интерфейса, чтобы понять, какие сценарии записи вообще доступны."""
    booking_mode: BookingMode
    terminology_profile: TerminologyProfile
    booking_config_version: int
    strict_schedule_enabled: bool


class EventQuoteRequest(HybridSchema):
    booking_mode: Literal["event"]
    lesson_id: int = Field(gt=0)
    spot_number: Optional[int] = Field(default=None, gt=0)
    payment_method: Literal["venue", "card"] = "venue"


class ResourceQuoteRequest(HybridSchema):
    booking_mode: Literal["resource"]
    service_id: int = Field(gt=0)
    branch_id: int = Field(gt=0)
    # None — «Любой специалист» (§3.3): сервер сам выбирает подходящего по
    # минимальному teacher_id среди свободных, показ мастера — после выбора
    # времени, а не до.
    teacher_id: Optional[int] = Field(default=None, gt=0)
    # Точный момент из ответа availability — не локальное время и не строка,
    # которую можно было бы получить копированием чужого запроса вручную.
    starts_at: datetime
    payment_method: Literal["venue", "card"] = "venue"


BookingQuoteRequest = Annotated[
    Union[EventQuoteRequest, ResourceQuoteRequest],
    Field(discriminator="booking_mode"),
]


class CrmEventQuoteRequest(EventQuoteRequest):
    client_id: int = Field(gt=0)


class CrmResourceQuoteRequest(ResourceQuoteRequest):
    client_id: int = Field(gt=0)
    hall_id: Optional[int] = Field(default=None, gt=0)


CrmQuoteRequest = Annotated[Union[CrmEventQuoteRequest, CrmResourceQuoteRequest], Field(discriminator="booking_mode")]


class ConfirmRequest(HybridSchema):
    quote_id: str = Field(min_length=36, max_length=36)


class RescheduleConfirmRequest(ConfirmRequest):
    expected_version: int = Field(gt=0)


class AvailabilityQuery(HybridSchema):
    service_id: int = Field(gt=0)
    branch_id: int = Field(gt=0)
    date_from: date
    date_to: date
    teacher_id: Optional[int] = Field(default=None, gt=0)


class AvailabilitySlot(HybridSchema):
    starts_at: datetime
    local_start: datetime
    tz_iana: str
    teacher_ids: list[int]


class AvailabilityRead(HybridSchema):
    slots: list[AvailabilitySlot]
    reason: Optional[str] = None


class CrmAvailabilityQuery(AvailabilityQuery):
    # Зал выбирает только CRM (§HB-13 п.5): в Mini-app ресурсом по умолчанию
    # является мастер, и предлагать клиенту выбор зала первая версия не должна.
    # Без этого поля админский предпросмотр слотов расходился бы с quote,
    # который зал учитывает.
    hall_id: Optional[int] = Field(default=None, gt=0)


class PublicAvailabilityQuery(AvailabilityQuery):
    # Public studio code is resolved exclusively by get_viewer, not used as a numeric tenant ID.
    studio_id: Optional[str] = None


class StaffDayQuery(HybridSchema):
    """Мастера услуги на ОДИН день. Диапазона здесь нет намеренно: вопрос «кто
    сегодня работает» задаётся про конкретный день, а неделя мастеров — это
    другой экран и другой ответ."""
    service_id: int = Field(gt=0)
    branch_id: int = Field(gt=0)
    date: date


class PublicStaffDayQuery(StaffDayQuery):
    studio_id: Optional[str] = None


class StaffDayMemberRead(HybridSchema):
    """Мастер в списке дня.

    `works` и `free_count` — РАЗНЫЕ вопросы, и схлопывать их нельзя: занятая
    смена даёт `works=true, free_count=0`, выходной — `works=false,
    free_count=0`. Клиент по ним рисует серую карточку «нет свободного времени»
    против полного отсутствия мастера в списке.

    `first_free` — наивное стенное время студии, без смещения (как `local_start`
    у слота): мини-приложение показывает его срезом строки, не пропуская через
    часовой пояс телефона.
    """
    teacher_id: int
    name: str
    last_name: Optional[str] = None
    photo_url: Optional[str] = None
    works: bool
    reason: Optional[str] = None
    free_count: int
    first_free: Optional[datetime] = None


class StaffDayRead(HybridSchema):
    staff: list[StaffDayMemberRead]
    reason: Optional[str] = None


class QuoteRead(HybridSchema):
    quote_id: str
    expires_at: datetime
    booking_mode: ServiceBookingMode
    terms: dict
    next_action: Literal["none", "wait_approval", "pay"]
    reservation_id: Optional[int] = None


class BookingRead(HybridSchema):
    reservation_id: int
    lesson_id: int
    booking_mode: ServiceBookingMode
    status: Literal["active", "pending", "hold", "attended", "cancelled"]
    version: int
    next_action: Literal["none", "wait_approval", "pay"]
    payment_url: Optional[str] = None
