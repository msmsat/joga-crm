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
