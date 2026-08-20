import i18n from '../i18n';
import { queryClient } from '../api/queryClient';
import { queryKeys } from '../api/queryKeys';
import { getCurrencySymbol } from '../components/UI';

// Код языка интерфейса — он же тег для Intl: 'cs', 'sv', 'el' и остальные
// коды ISO 639-1 из LANGUAGES валидны как BCP-47. 'en' на случай, если
// i18n ещё не инициализирован (форматтеры зовут и вне компонентов).
const locale = () => i18n.language || 'en';

// Синхронное чтение валюты студии из кэша react-query — те же данные, что
// useStudioCurrency(), но доступны вне компонентов (как i18n.language выше).
function studioCurrencySymbol(): string {
  const settings = queryClient.getQueryData<{ currency?: string | null }>(queryKeys.studioSettings);
  return getCurrencySymbol(settings?.currency ?? undefined);
}

/** Целыми, с разделителями по языку интерфейса. Символ — валюта студии. Только для Отчётов. */
export function fmtMoney(n: number, symbol = studioCurrencySymbol()): string {
  return `${Math.round(n).toLocaleString(locale())} ${symbol}`;
}

/** Компактные деньги для плиток: «284K ₽», «1.2M ₽». Символ — из настроек студии. */
export function fmtMoneyCompact(n: number, symbol = studioCurrencySymbol()): string {
  const value = new Intl.NumberFormat(locale(), {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(n);
  return `${value} ${symbol}`;
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString(locale(), { maximumFractionDigits: 1 })}%`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString(locale());
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
