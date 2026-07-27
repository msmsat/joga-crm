import type { IntegrationsConfig, Session, Studio } from "./types";

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

export const INITIAL_INTEGRATIONS_CONFIG: IntegrationsConfig = {
  whatsapp: { connected: true, phone: "+7 (900) 123-45-67", webhook: "https://api.velora.studio/v1/wa/webhook" },
  telegram: { connected: true, token: "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ", welcomeMsg: "Приветствуем! Выберите удобное время для записи ✨" },
  instagram: { connected: false, account: "" },
  google: { connected: false, calendarName: "Основной календарь", syncType: "Двусторонняя" },
  onec: { connected: false, url: "https://1c.studio.ru/base", login: "" },
  yandex: { connected: true, shopId: "208492", testMode: false },
};

export const INITIAL_SESSIONS: Session[] = [
  { id: 1, device: "MacBook Pro 14\"", platform: null, browser: "Safari", location_city: "Москва", location_country: "РФ", last_active: new Date().toISOString(), is_current: true, icon: "laptop" },
  { id: 2, device: "iPhone 13 Pro", platform: null, browser: "App / iOS", location_city: "Санкт-Петербург", location_country: "РФ", last_active: new Date(Date.now() - 20 * 60 * 60_000).toISOString(), is_current: false, icon: "phone" },
];

export const INITIAL_STUDIOS_LIST: Studio[] = [
  { id: "1", name: "Pilates & Wellness Studio", theme: "light", desc: "Жемчужно-алебастровый UI · Основное пространство" },
  { id: "2", name: "Barbershop Blade & Co", theme: "dark", desc: "Матовый глубокий графит · Брутальный стиль" },
];
