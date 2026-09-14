/**
 * Дни и время индивидуальной записи — БЕЗ часового пояса телефона.
 *
 * Сервер отдаёт слот двумя полями: `starts_at` (точный момент, уходит обратно в
 * quote) и `local_start` — стенное время студии строкой без смещения. Всё, что
 * видит человек, берётся из второго, и берётся СРЕЗОМ: `new Date(local_start)`
 * прочитал бы строку в поясе телефона, и клиент из другой страны увидел бы
 * чужой час (AC-21).
 *
 * День — тоже строка `YYYY-MM-DD` местного дня студии. Арифметика над ним идёт в
 * UTC-полдень: там нет перевода часов, и «+1 день» всегда попадает в следующие
 * сутки, а не в 23:00 того же дня.
 *
 * Модуль без React и без i18n: его проверяет `node src/lib/bookingPage.check.ts`.
 */
import type { AvailabilityQuery } from '../api/hybrid.types';

export type IsoDay = string;

const DAY_MS = 86_400_000;
const pad = (value: number) => String(value).padStart(2, '0');

/** Сколько дней спрашиваем за раз: две недели — лента дней на два жеста. */
export const PAGE_DAYS = 14;

/** Горизонт, когда правил студии нет под рукой («Мои записи» без каталога). */
const FALLBACK_WINDOW_DAYS = 60;

/**
 * Сегодня — в поясе студии, а не телефона.
 *
 * Вечером в Праге клиент из Нью-Йорка всё ещё во «вчера», и лента, построенная
 * от дня телефона, начиналась бы с прошедшего для студии дня. Неизвестная зона
 * (или среда без Intl) — день телефона: это прежнее поведение, а не поломка.
 */
export function studioToday(timeZone: string | null | undefined, now: Date = new Date()): IsoDay {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now);
      const part = (type: string) => parts.find((item) => item.type === type)?.value;
      const [year, month, day] = [part('year'), part('month'), part('day')];
      if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
      /* RangeError на незнакомой зоне — ниже день телефона. */
    }
  }
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const noon = (day: IsoDay) => {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date, 12);
};

export const addDays = (day: IsoDay, count: number): IsoDay =>
  new Date(noon(day) + count * DAY_MS).toISOString().slice(0, 10);

export const daysBetween = (from: IsoDay, to: IsoDay): number => Math.round((noon(to) - noon(from)) / DAY_MS);

/** Дата для Intl-подписи. Форматировать ОБЯЗАТЕЛЬНО с `timeZone: 'UTC'`. */
export const dayDate = (day: IsoDay): Date => new Date(noon(day));

/** Подпись дня на языке интерфейса. Зона UTC обязательна: `dayDate` — полдень UTC. */
export const formatDay = (day: IsoDay, locale: string, options: Intl.DateTimeFormatOptions): string => {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(dayDate(day));
  } catch {
    return day;
  }
};

/**
 * Заглавная только первая буква. CSS `capitalize` поднимает КАЖДОЕ слово, и
 * «вторник, 15 сентября» становилось «Вторник, 15 Сентября», а «2026 г.» —
 * «2026 Г.»: для русского, украинского и чешского это ошибка, а не стиль.
 */
export const upperFirst = (text: string): string =>
  text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;

export const dayOf = (localStart: string): IsoDay => localStart.slice(0, 10);

/** «ЧЧ:ММ» из `local_start` — срезом, см. шапку модуля. */
export const timeOf = (localStart: string): string => localStart.slice(11, 16);

export const relativeDay = (day: IsoDay, today: IsoDay): 'today' | 'tomorrow' | null => {
  const offset = daysBetween(today, day);
  return offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : null;
};

/** Последний день, который студия открыла клиенту: сегодня + booking_window_days. */
export const lastBookableDay = (today: IsoDay, windowDays: number | null | undefined): IsoDay =>
  addDays(today, windowDays != null && windowDays >= 0 ? windowDays : FALLBACK_WINDOW_DAYS);

/** Дни страницы `page`; `null` — страница уже за горизонтом. */
export function pageRange(today: IsoDay, page: number, last: IsoDay): { from: IsoDay; to: IsoDay } | null {
  const from = addDays(today, page * PAGE_DAYS);
  if (daysBetween(from, last) < 0) return null;
  const end = addDays(from, PAGE_DAYS - 1);
  return { from, to: daysBetween(end, last) < 0 ? last : end };
}

/** Сколько страниц умещается в горизонт. */
export const pageCount = (today: IsoDay, last: IsoDay): number =>
  Math.max(1, Math.floor(daysBetween(today, last) / PAGE_DAYS) + 1);

/** Дни подряд — для ленты: пустой день тоже день, его надо показать. */
export const dayList = (from: IsoDay, to: IsoDay): IsoDay[] =>
  Array.from({ length: Math.max(0, daysBetween(from, to) + 1) }, (_, i) => addDays(from, i));

/**
 * Запрос времени. «Любой мастер» — это ОТСУТСТВИЕ `teacher_id`, а не null в
 * строке запроса: иначе прошлый выбор мог бы доехать до сервера под видом
 * «любого», а сервер склеивает время всех подходящих мастеров только без ключа.
 */
export function availabilityQuery(scope: {
  serviceId: number; branchId: number; teacherId: number | null; from: IsoDay; to: IsoDay;
}): AvailabilityQuery {
  const query: AvailabilityQuery = {
    service_id: scope.serviceId, branch_id: scope.branchId, date_from: scope.from, date_to: scope.to,
  };
  if (scope.teacherId != null) query.teacher_id = scope.teacherId;
  return query;
}

type Timed = { local_start: string; teacher_ids: number[] };

/** Слоты по дням. Порядок внутри дня — как у сервера (по времени). */
export function groupByDay<T extends Timed>(slots: T[]): Map<IsoDay, T[]> {
  const days = new Map<IsoDay, T[]>();
  for (const slot of slots) {
    const day = dayOf(slot.local_start);
    const list = days.get(day);
    if (list) list.push(slot);
    else days.set(day, [slot]);
  }
  return days;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export const dayPart = (localStart: string): DayPart => {
  const hour = Number(localStart.slice(11, 13));
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
};

/** Время дня тремя группами — длинный список читается кусками, а не сплошной сеткой. */
export function groupByPart<T extends Timed>(slots: T[]): { part: DayPart; slots: T[] }[] {
  const order: DayPart[] = ['morning', 'afternoon', 'evening'];
  return order
    .map((part) => ({ part, slots: slots.filter((slot) => dayPart(slot.local_start) === part) }))
    .filter((group) => group.slots.length > 0);
}

/** Первый свободный `local_start` каждого мастера. Слоты приходят по возрастанию. */
export function firstFreeByTeacher(slots: Timed[]): Map<number, string> {
  const first = new Map<number, string>();
  for (const slot of slots) {
    for (const teacher of slot.teacher_ids) {
      if (!first.has(teacher)) first.set(teacher, slot.local_start);
    }
  }
  return first;
}

/** Ближайший день со свободным временем, начиная с `from`. */
export function firstDayWithSlots(days: IsoDay[], byDay: Map<IsoDay, unknown[]>, from?: IsoDay): IsoDay | null {
  return days.find((day) => (from === undefined || day >= from) && (byDay.get(day)?.length ?? 0) > 0) ?? null;
}
