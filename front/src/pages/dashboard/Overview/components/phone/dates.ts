// Даты телефонной главной. Сервер отдаёт даты без пояса («2026-10-08» или
// «2026-10-08T18:30:00») — это местное время студии, и `new Date('2026-10-08')`
// прочитал бы его как полночь по UTC: западнее Гринвича подпись съехала бы на
// вчера.

/** ISO без пояса → местная дата. */
export function localDate(iso: string): Date {
  return new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
}

/** Первая буква — заглавная: Intl отдаёт «четверг, 8 октября». */
export function cap(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
