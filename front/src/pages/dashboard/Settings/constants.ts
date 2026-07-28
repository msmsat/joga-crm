// Коды — то, что уходит на бэк (GeneralUpdate); подписи — через i18n
// (general.locale.currencyLabels/firstDayLabels/timezoneLabels в settings.json),
// либо эндонимы/примеры формата ниже, не требующие перевода.
export const CURRENCIES = ["RUB", "USD", "EUR", "KZT", "UAH", "GBP", "AED", "TRY"] as const;
export const LANGUAGES = ["ru", "en"] as const;
export const LANGUAGE_LABELS = ["Русский", "English"]; // эндонимы — не переводятся
export const DATE_FORMATS = ["DD.MM.YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export const DATE_FORMAT_LABELS = ["31.12.2026", "12/31/2026", "2026-12-31"]; // примеры формата, не текст
export const FIRST_DAY_OPTIONS = ["monday", "sunday"] as const;
// Короткий список популярных поясов (IANA, валидируется zoneinfo на бэке) —
// полный список с поиском по вводу в BACKLOG (см. эпик 2, задача 4).
export const TIMEZONES = [
  "Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk",
  "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka",
  "Europe/Berlin", "Europe/London", "America/New_York", "America/Los_Angeles",
] as const;
