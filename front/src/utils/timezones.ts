// Часовые пояса студии. Лежат здесь, а не в components/UI.tsx, по той же
// причине, по которой туда же уехали LANGUAGES и CURRENCIES: таблицу читает
// самопроверка (utils/geo.check.ts), а она запускается голым node и импортом
// из модуля с React и JSX подавиться. UI.tsx реэкспортирует — импорты по
// проекту менять не нужно.
//
// Все целые офсеты, по порядку и без дыр: начинаем с Праги (UTC+1) и идём на
// запад — Лондон, Нью-Йорк, Гавайи (-11), за линией перемены дат +14 и обратно
// домой через +2, соседний с первым. Список значений обязан совпадать с Literal
// Timezone в back/schemas/settings/general.py. Получасовых поясов (+5:30) нет
// намеренно: офсет парсится как int часов (services/daily_notify.py:_studio_tz).
//
// Города НЕ переводятся. Это имена собственные: в пикере часовых поясов их
// держат латиницей все, а двадцать две копии одного списка — ровно то, из-за
// чего эти подписи годами оставались с набором городов от Калининграда до
// Камчатки. Один список — одно место, где его чинить.
//
// Офсеты стандартные, зимние: Прага — UTC+1, летом фактически +2. Пикер
// выбирает ПОЯС, а не текущее смещение.
const TIMEZONE_CITIES: [string, string][] = [
  ["UTC+1", "Prague, Berlin, Paris"],
  ["UTC+0", "London, Lisbon, Dublin"],
  ["UTC-1", "Azores, Cape Verde"],
  ["UTC-2", "Fernando de Noronha"],
  ["UTC-3", "Buenos Aires, São Paulo"],
  ["UTC-4", "Halifax, Santiago"],
  ["UTC-5", "New York, Toronto, Miami"],
  ["UTC-6", "Chicago, Dallas, Mexico City"],
  ["UTC-7", "Denver, Phoenix, Calgary"],
  ["UTC-8", "Los Angeles, Seattle, Vancouver"],
  ["UTC-9", "Anchorage"],
  ["UTC-10", "Honolulu"],
  ["UTC-11", "Pago Pago, Niue"],
  ["UTC+14", "Kiritimati"],
  ["UTC+13", "Apia, Nuku'alofa"],
  ["UTC+12", "Auckland, Suva"],
  ["UTC+11", "Nouméa, Honiara"],
  ["UTC+10", "Sydney, Brisbane, Guam"],
  ["UTC+9", "Tokyo, Seoul"],
  ["UTC+8", "Singapore, Hong Kong, Beijing"],
  ["UTC+7", "Bangkok, Jakarta, Hanoi"],
  ["UTC+6", "Dhaka, Bishkek"],
  // Казахстан перешёл на UTC+5 в марте 2024 — здесь Алматы стоял в +6.
  ["UTC+5", "Tashkent, Almaty, Karachi"],
  ["UTC+4", "Dubai, Baku, Tbilisi"],
  ["UTC+3", "Istanbul, Nairobi, Riyadh"],
  ["UTC+2", "Kyiv, Athens, Helsinki"],
];

// Смещение стоит ПЕРВЫМ, а не в скобках в конце: в закрытом селекте длинная
// строка обрезается многоточием, и «UTC+1» — то единственное, что человек ищет
// глазами, — пропадало вместе с хвостом («Prague, Berlin, Par…»). Города
// остаются: по ним пояс и узнают те, кто не помнит своё смещение наизусть.
export const TIMEZONES = TIMEZONE_CITIES.map(([value, cities]) => ({
  value,
  label: `${value} · ${cities}`,
}));

/** Есть ли такой пояс в выборе. */
export const isOfferedTimezone = (value: string): boolean =>
  TIMEZONES.some(tz => tz.value === value);

/**
 * Пояс по часам самого устройства — запасной вариант, когда страну по IP
 * определить не вышло (utils/geo.timezoneForCountry).
 *
 * Берётся СТАНДАРТНОЕ (зимнее) смещение, а не сегодняшнее: пикер перечисляет
 * пояса, и летом `getTimezoneOffset()` для Праги возвращал +2 — человеку
 * подставлялось «Kyiv, Athens, Helsinki» вместо «Prague, Berlin, Paris», и
 * каждый, кто регистрировался с апреля по октябрь, начинал с чужого пояса.
 * Летнее время всегда СДВИГАЕТ часы вперёд, поэтому стандартное смещение —
 * меньшее из январского и июльского; это верно и для южного полушария
 * (Сидней: январь +11, июль +10 → +10), и для стран без перевода часов.
 */
export const browserTimezone = (): string => {
  const year = new Date().getFullYear();
  const offset = (month: number) => -new Date(year, month, 1).getTimezoneOffset() / 60;
  // Дробные пояса (+5:30) обрезаем к нулю — в списке только целые.
  const hours = Math.trunc(Math.min(offset(0), offset(6)));
  const value = `UTC${hours >= 0 ? "+" : ""}${hours}`;
  return isOfferedTimezone(value) ? value : "UTC+0";
};
