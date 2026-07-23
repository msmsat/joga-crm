"""Схемы умных сценариев (V5-4, задача 1).

Сценарий создаётся из шаблона (`template` — один из 5), а не из полного тела:
владелец выбирает «человеческую» заготовку, а дефолтные пороги берутся из
`SCENARIO_TEMPLATES` (единый источник правды — из аудита). Дальше пороги
правятся через PATCH. Валидация параметров — здесь, чтобы роутер был тонким.
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import Field, model_validator

from schemas._base import BaseSchema

TriggerType = Literal["inactive_days", "low_subscription", "birthday", "nth_visit", "referral"]
ActionType = Literal["points", "gift_classes", "certificate", "renewal_offer"]
Channel = Literal["email"]  # единственный живой канал MVP
TemplateKey = Literal["win_back", "expiring_subscription", "birthday_gift", "fifth_visit", "referral_thanks"]


# Единый источник дефолтов для 5 шаблонов (значения из аудита).
SCENARIO_TEMPLATES: dict[str, dict] = {
    "win_back": {
        "trigger_type": "inactive_days",
        "trigger_params": {"days": 21},
        "action_type": "points",
        "action_params": {"points": 200},
    },
    "expiring_subscription": {
        "trigger_type": "low_subscription",
        "trigger_params": {"classes_left": 2},
        "action_type": "renewal_offer",
        "action_params": {"discount": 10},
    },
    "birthday_gift": {
        "trigger_type": "birthday",
        "trigger_params": {},
        "action_type": "points",
        "action_params": {"points": 300},
    },
    "fifth_visit": {
        "trigger_type": "nth_visit",
        "trigger_params": {"n": 5},
        "action_type": "gift_classes",
        "action_params": {"classes": 1},
    },
    "referral_thanks": {
        "trigger_type": "referral",
        "trigger_params": {},
        "action_type": "points",
        "action_params": {"points": 500},
    },
}


class ScenarioCreate(BaseSchema):
    """POST-тело: только имя шаблона. Пороги подтягиваются из SCENARIO_TEMPLATES."""
    template: TemplateKey


class ScenarioUpdate(BaseSchema):
    """PATCH: правка порогов и включение/выключение. Тип триггера/действия
    после создания не меняем — это по сути другой сценарий."""
    trigger_params: Optional[dict] = None
    action_params: Optional[dict] = None
    is_enabled: Optional[bool] = None

    @model_validator(mode="after")
    def _validate_params(self):
        if self.trigger_params is not None:
            _check_trigger_params(self.trigger_params)
        if self.action_params is not None:
            _check_action_params(self.action_params)
        return self


class ScenarioRead(BaseSchema):
    id: int
    trigger_type: str
    trigger_params: dict
    action_type: str
    action_params: dict
    channel: str
    is_enabled: bool
    fired_count: int
    last_run_at: Optional[datetime] = None
    created_at: datetime


def _positive(params: dict, key: str) -> None:
    """Если ключ задан — он целый ≥ 1. Отсутствие ключа допускается (partial patch)."""
    if key in params:
        v = params[key]
        if not isinstance(v, int) or isinstance(v, bool) or v < 1:
            raise ValueError(f"«{key}» должно быть целым числом ≥ 1")


def _check_trigger_params(params: dict) -> None:
    # дни, занятия, N — все пороги ≥ 1; какой именно ключ, зависит от триггера,
    # но проверяем все известные — лишних валидаций нет, отсутствующие пропускаются.
    for key in ("days", "classes_left", "days_left", "n"):
        _positive(params, key)


def _check_action_params(params: dict) -> None:
    for key in ("points", "classes", "amount"):
        _positive(params, key)
    if "discount" in params:
        d = params["discount"]
        if not isinstance(d, int) or isinstance(d, bool) or not (0 <= d <= 100):
            raise ValueError("«discount» должно быть от 0 до 100")
