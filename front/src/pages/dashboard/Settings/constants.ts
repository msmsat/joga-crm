// Коды — то, что уходит на бэк (GeneralUpdate); подписи — через i18n
// (general.locale.firstDayLabels в settings.json) либо примеры формата ниже,
// не требующие перевода. currency/timezone/language берутся напрямую из
// components/UI.tsx — тот же список, что и на онбординге (см. GeneralTab).
export const DATE_FORMATS = ["DD.MM.YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export const DATE_FORMAT_LABELS = ["31.12.2026", "12/31/2026", "2026-12-31"]; // примеры формата, не текст
export const FIRST_DAY_OPTIONS = ["monday", "sunday"] as const;
