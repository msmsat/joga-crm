import i18n from '../i18n';

const LOCALE: Record<string, string> = { ru: 'ru-RU', en: 'en-US' };

/** Рубли целыми, с разделителями по языку интерфейса. Только для Отчётов. */
export function fmtMoney(n: number, symbol = '₽'): string {
  const locale = LOCALE[i18n.language] ?? 'ru-RU';
  return `${Math.round(n).toLocaleString(locale)} ${symbol}`;
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString(LOCALE[i18n.language] ?? 'ru-RU', { maximumFractionDigits: 1 })}%`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString(LOCALE[i18n.language] ?? 'ru-RU');
}

/** Подпись тика графика серии — формат зависит от разбивки бакета.
 * hour → "14:00" · day → "24.07" · week → "24.07" (начало недели). */
export function fmtBucket(iso: string, group: 'hour' | 'day' | 'week'): string {
  if (group === 'hour') return iso.slice(11, 16);
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}`;
}

/** Диапазон дат для заголовка drilldown-модалки: "01.07 — 25.07". */
export function fmtDateRange(from: string, to: string): string {
  return `${fmtBucket(from, 'day')} — ${fmtBucket(to, 'day')}`;
}

/** Дата последнего визита человеческим текстом: "сегодня" / "3 дня назад" / "21.07"
 * (после недели — просто число, чтобы не считать в уме "12 дней назад"). */
export function fmtRelativeDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (days === 0) return i18n.t('reports:clients.relative.today');
  if (days > 0 && days <= 6) return i18n.t('reports:clients.relative.daysAgo', { count: days });
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}`;
}
