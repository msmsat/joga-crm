/**
 * Занятие в личный календарь — без сервера и без разрешений.
 *
 * Два пути, потому что календарей два мира: Google открывается ссылкой
 * (в Telegram — `openLink`, во внешнем браузере), Apple и Outlook понимают
 * файл `.ics` — Safari на iPhone сам предлагает «Добавить в Календарь».
 *
 * Время — МОМЕНТ (`starts_at`, UTC), а не «18:00» студии: календарь человека
 * сам переведёт его в свой пояс, и занятие в Праге не уедет на час у того, кто
 * смотрит из Киева.
 */
export type CalendarEvent = {
  title: string;
  start: Date;
  durationMin: number;
  location?: string;
  details?: string;
  /** Постоянный id события: повторное добавление обновит, а не задвоит. */
  uid: string;
};

/** 2026-10-12T16:00:00Z → 20261012T160000Z */
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const endOf = (event: CalendarEvent) => new Date(event.start.getTime() + event.durationMin * 60_000);

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.start)}/${stamp(endOf(event))}`,
  });
  if (event.location) params.set('location', event.location);
  if (event.details) params.set('details', event.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Экранирование текста по RFC 5545: обратная косая, запятая, точка с запятой, перевод строки. */
const icsText = (value: string) => value.replace(/[\\,;]/g, (char) => `\\${char}`).replace(/\r?\n/g, '\\n');

export function icsFile(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Velora//Mini App//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(endOf(event))}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.details ? [`DESCRIPTION:${icsText(event.details)}`] : []),
    // Напоминание за час — то, ради чего занятие и кладут в календарь.
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(event.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/** Скачать `.ics`: браузер отдаёт файл календарю (на iPhone — сразу лист «Добавить»). */
export function downloadIcs(event: CalendarEvent, fileName = 'lesson.ics'): void {
  const url = URL.createObjectURL(new Blob([icsFile(event)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Карта по адресу: универсальная ссылка Google открывает приложение, если оно есть. */
export const mapsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
