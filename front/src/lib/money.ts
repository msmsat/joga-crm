import { getCurrencySymbol } from '../components/UI';

// Локаль влияет только на разделители тысяч; символ — из getCurrencySymbol (валюта студии).
const LOCALE: Record<string, string> = { RUB: 'ru-RU', USD: 'en-US', EUR: 'de-DE', KZT: 'ru-KZ' };

export function localeForCurrency(currency = 'RUB'): string {
  return LOCALE[currency] ?? 'ru-RU';
}

// amount — в основной единице (уже /100). currency — код валюты студии (useStudioCurrency).
export function formatMoney(amount: number, currency = 'RUB'): string {
  return `${getCurrencySymbol(currency)}${amount.toLocaleString(localeForCurrency(currency))}`;
}
