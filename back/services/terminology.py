"""Validated server-owned business vocabulary and complete message templates."""
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ROOT = Path(__file__).resolve().parent.parent / "data" / "terminology"
LOCALES = frozenset({"en", "ru", "uk", "cs", "de", "fr", "es", "it", "pt", "pl", "bg",
                     "hr", "sr", "ro", "hu", "tr", "el", "sq", "da", "fi", "no", "sv"})
# Профили 1-в-1 повторяют разделы экрана «Вид деятельности» в онбординге
# (ACTIVITY_SECTIONS во front/src/components/UI.tsx): что владелец выбрал, тем
# студия и говорит. Отдельной таблицы «направление → профиль» поэтому нет —
# есть PROFILE_ACTIVITIES ниже, и она повторяет ту же разбивку.
PROFILES = frozenset({"studio", "sport", "beauty", "recovery", "relax", "other"})
FALLBACK_PROFILE = "other"
MESSAGE_KEYS = frozenset({"choose_staff", "choose_offering", "empty_slots", "my_bookings", "confirm_booking"})

# Участвует ли МЕСТО (зал/кресло/кабинет) в расписании как ось.
#
# Это НЕ перевод, поэтому живёт в коде, а не в 22 копиях JSON: значение у
# профиля одно на все языки. False означает, что клиент записывается к
# человеку, а не к месту: у барбершопа и массажного кабинета кресло —
# имущество филиала, а не колонка журнала. Каталог показывает места всегда,
# независимо от этого флага.
SPACE_IS_AXIS = {
    "studio": True,
    "sport": True,
    "beauty": False,
    "recovery": False,
    "relax": True,
    "other": True,
}

# Направления онбординга по профилям — копия items из ACTIVITY_SECTIONS
# (front/src/components/UI.tsx). Дублирование осознанное: это данные формы
# регистрации, а не логика, и разъезд ловит tests/test_terminology.py.
PROFILE_ACTIVITIES = {
    "studio": ("yoga", "pilates", "stretching", "barre", "meditation"),
    "sport": ("gym", "crossfit", "martial_arts", "dance", "swimming",
              "kids_sport", "personal_training"),
    "beauty": ("barbershop", "hair_salon", "makeup", "nails", "brows_lashes",
               "cosmetology", "hair_removal", "tattoo"),
    "recovery": ("massage", "manual_therapy", "osteopathy", "physio", "nutrition"),
    "relax": ("spa", "sauna", "wraps"),
    "other": ("other",),
}

# Имена профилей до шести разделов (HB-14). Нужны миграции и коду, который
# может встретить старое значение в уже выданном токене или кэше клиента.
# generic → other и fitness → sport сохраняют слова буква в букву: generic и
# other описаны одним набором форм, fitness и sport — тоже.
LEGACY_PROFILES = {"generic": "other", "fitness": "sport", "beauty": "beauty"}


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Forms(Strict):
    singular: str = Field(min_length=1, max_length=80, pattern=r"^[^<>{}]+$")
    plural: str = Field(min_length=1, max_length=80, pattern=r"^[^<>{}]+$")
    accusative: str = Field(min_length=1, max_length=80, pattern=r"^[^<>{}]+$")


class Offerings(Strict):
    event: Forms
    resource: Forms


class Profile(Strict):
    staff: Forms
    offering: Offerings
    # Зал / кресло / кабинет / место. Три формы — потолок: подписи в интерфейсе
    # написаны так, чтобы род и падежи сверх этих трёх не требовались (см.
    # docs/superpowers/specs/2026-09-12-industry-space-terminology-design.md §5).
    space: Forms
    messages: dict[str, str]

    @field_validator("messages")
    @classmethod
    def valid_messages(cls, value):
        if set(value) != MESSAGE_KEYS:
            raise ValueError("incomplete or unknown terminology messages")
        for message in value.values():
            if not message or len(message) > 300 or "<" in message or ">" in message:
                raise ValueError("invalid terminology message")
            plain = message.replace("{{staff.accusative}}", "").replace("{{offering.accusative}}", "")
            if "{" in plain or "}" in plain:
                raise ValueError("unknown terminology interpolation")
        return value


class PresetFile(Strict):
    version: Literal[1]
    locale: str
    profiles: dict[str, Profile]

    @field_validator("profiles")
    @classmethod
    def profiles_complete(cls, value):
        if set(value) != PROFILES:
            raise ValueError("incomplete or unknown profiles")
        return value


def locale_key(locale):
    value = (locale or "en").lower().replace("_", "-").split("-")[0]
    return value if value in LOCALES else "en"


def profile_key(profile):
    """Имя профиля к сегодняшнему набору: старое значение переводится, чужое
    уходит в FALLBACK_PROFILE. Одна точка на весь код — иначе `generic` из
    кэша клиента где-нибудь молча превратился бы в чужой словарь."""
    if profile in PROFILES:
        return profile
    return LEGACY_PROFILES.get(profile, FALLBACK_PROFILE)


def profile_for_activities(subtype):
    """Профиль по направлениям онбординга (`Studio.business_subtype` — список
    через запятую). Раздел задаёт первое известное направление: выбор внутри
    одного раздела запрещён формой, а неизвестное значение не должно утаскивать
    студию в `other` только потому, что стоит первым."""
    for activity in (subtype or "").split(","):
        activity = activity.strip()
        for profile, items in PROFILE_ACTIVITIES.items():
            if activity in items:
                return profile
    return FALLBACK_PROFILE


def space_is_axis(profile, override=None):
    """Роль места в расписании: тумблер владельца перекрывает отрасль.

    Единственное место, где эти два источника складываются — поэтому фронт
    получает готовый ответ и не считает его сам."""
    if override is not None:
        return bool(override)
    return SPACE_IS_AXIS[profile_key(profile)]


@lru_cache(maxsize=32)
def _load(locale):
    parsed = PresetFile.model_validate(json.loads((ROOT / f"{locale}.json").read_text(encoding="utf-8")))
    if parsed.locale != locale:
        raise ValueError("terminology locale mismatch")
    return parsed


def resolve_terms(profile, locale, booking_mode):
    language = locale_key(locale)
    profile = profile_key(profile)
    data = _load(language).profiles[profile]
    mode = booking_mode if booking_mode in {"event", "resource"} else "resource"
    return {"version": 1, "locale": language, "profile": profile,
        "staff": data.staff.model_dump(), "offering": getattr(data.offering, mode).model_dump(),
        "space": data.space.model_dump(), "space_is_axis": SPACE_IS_AXIS[profile],
        "messages": dict(data.messages)}


def configuration(studio, locale=None):
    language = locale_key(locale or studio.language)
    profile = profile_key(studio.terminology_profile)
    return {"version": 1, "locale": language, "profile": profile,
            "space_is_axis": space_is_axis(profile, getattr(studio, "space_is_axis", None)),
            "profiles": {key: {**value.model_dump(), "space_is_axis": SPACE_IS_AXIS[key]}
                         for key, value in _load(language).profiles.items()}}
