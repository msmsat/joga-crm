import i18n from '../i18n';

const LOCALE: Record<string, string> = { ru: 'ru-RU', en: 'en-US' };

/** Рубли целыми, с разделителями по языку интерфейса. Только для Отчётов. */
export function fmtMoney(n: number, symbol = '₽'): string {
  const locale = LOCALE[i18n.language] ?? 'ru-RU';
  return `${Math.round(n).toLocaleString(locale)} ${symbol}`;
}

/** Компактные деньги для плиток: «284K ₽», «1.2M ₽». Символ — из настроек студии. */
export function fmtMoneyCompact(n: number, symbol = '₽'): string {
  const locale = LOCALE[i18n.language] ?? 'ru-RU';
  const value = new Intl.NumberFormat(locale, {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(n);
  return `${value} ${symbol}`;
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

/** Когда сессия была активна в последний раз: "Сейчас активна" / "5 мин. назад" /
 * "3 ч назад" / "2 дн. назад" — общий хелпер для списка сессий (Настройки) и
 * карточки текущей сессии (Профиль). */
export function fmtLastActive(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1) return i18n.t('settings:security.sessions.justNow');
  if (diff < 60) return i18n.t('settings:security.sessions.minutesAgo', { count: diff });
  const h = Math.floor(diff / 60);
  if (h < 24) return i18n.t('settings:security.sessions.hoursAgo', { count: h });
  return i18n.t('settings:security.sessions.daysAgo', { count: Math.floor(h / 24) });
}
