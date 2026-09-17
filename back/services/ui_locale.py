"""Supported CRM-interface locales, deliberately separate from outbound i18n.

``services.i18n`` remains the five-language service used by emails and chat
notifications.  This module is for the CRM web interface only.
"""

DEFAULT_UI_LANG = "en"
INTERFACE_LANGS = (
    "en", "ru", "sq", "bg", "hr", "cs", "da", "fi", "fr", "de", "el",
    "hu", "it", "no", "pl", "pt", "ro", "sr", "es", "sv", "tr", "uk",
)

# A historic, invalid ISO 639-1 spelling appears in old preference records.
_LEGACY_CODES = {"cz": "cs"}


def resolve_ui_locale(raw: str | None) -> str:
    """Return a supported UI locale, keeping English as the safe fallback."""
    code = (raw or "").strip().lower()
    code = _LEGACY_CODES.get(code, code)
    return code if code in INTERFACE_LANGS else DEFAULT_UI_LANG
