"""Validated server-owned business vocabulary and complete message templates."""
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ROOT = Path(__file__).resolve().parent.parent / "data" / "terminology"
LOCALES = frozenset({"en", "ru", "uk", "cs", "de", "fr", "es", "it", "pt", "pl", "bg",
                     "hr", "sr", "ro", "hu", "tr", "el", "sq", "da", "fi", "no", "sv"})
PROFILES = frozenset({"generic", "fitness", "beauty"})
MESSAGE_KEYS = frozenset({"choose_staff", "choose_offering", "empty_slots", "my_bookings", "confirm_booking"})


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


@lru_cache(maxsize=32)
def _load(locale):
    parsed = PresetFile.model_validate(json.loads((ROOT / f"{locale}.json").read_text(encoding="utf-8")))
    if parsed.locale != locale:
        raise ValueError("terminology locale mismatch")
    return parsed


def resolve_terms(profile, locale, booking_mode):
    language = locale_key(locale)
    profile = profile if profile in PROFILES else "generic"
    data = _load(language).profiles[profile]
    mode = booking_mode if booking_mode in {"event", "resource"} else "resource"
    return {"version": 1, "locale": language, "profile": profile,
        "staff": data.staff.model_dump(), "offering": getattr(data.offering, mode).model_dump(),
        "messages": dict(data.messages)}


def configuration(studio, locale=None):
    language = locale_key(locale or studio.language)
    profile = studio.terminology_profile if studio.terminology_profile in PROFILES else "generic"
    return {"version": 1, "locale": language, "profile": profile,
            "profiles": {key: value.model_dump() for key, value in _load(language).profiles.items()}}
