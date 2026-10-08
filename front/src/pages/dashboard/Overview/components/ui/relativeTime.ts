import type { TFunction } from 'i18next';

/** Относительное время платформенным Intl — без ручных склонений и словаря на каждую единицу. */
export function toRelative(iso: string, locale: string, t: TFunction): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return t('events.justNow');
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (min < 60) return rtf.format(-min, 'minute');
  const h = Math.floor(min / 60);
  return h < 24 ? rtf.format(-h, 'hour') : rtf.format(-Math.floor(h / 24), 'day');
}
