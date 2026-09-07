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
from datetime import datetime
from typing import Annotated, Literal, Optional, Union

from pydantic import ConfigDict, Field

from schemas._base import BaseSchema

# Studio.booking_mode — управляет каталогом целиком.
BookingMode = Literal["event", "resource", "hybrid"]
# Service.booking_mode — resource+group запрещена отдельным правилом (§6.1),
# поэтому у услуги нет "hybrid": одна услуга — один сценарий.
ServiceBookingMode = Literal["event", "resource"]
TerminologyProfile = Literal["generic", "fitness", "beauty"]

# Пока не готовы HB-07 (единый замок и закрытие обходов) и HB-24 (аудит
# наследия перед включением) — сервер не разрешает НИКОМУ, ни одной студии,
# завести resource/hybrid ни на уровне студии, ни на уровне услуги. Это не
# бизнес-правило конкретной студии, а готовность самого кода: множество,
# а не одна проверка "== event", чтобы расширение в HB-24 было заменой этой
# строки, а не поиском по файлам, где условие продублировано текстом.
AVAILABLE_BOOKING_MODES: frozenset[str] = frozenset({"event"})


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
    lesson_id: int
    spot_number: Optional[int] = None


class ResourceQuoteRequest(HybridSchema):
    booking_mode: Literal["resource"]
    service_id: int
    branch_id: int
    # None — «Любой специалист» (§3.3): сервер сам выбирает подходящего по
    # минимальному teacher_id среди свободных, показ мастера — после выбора
    # времени, а не до.
    teacher_id: Optional[int] = None
    # Точный момент из ответа availability — не локальное время и не строка,
    # которую можно было бы получить копированием чужого запроса вручную.
    starts_at: datetime


BookingQuoteRequest = Annotated[
    Union[EventQuoteRequest, ResourceQuoteRequest],
    Field(discriminator="booking_mode"),
]
