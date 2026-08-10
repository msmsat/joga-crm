import { getCurrencySymbol } from '../components/UI';

// Локаль влияет только на разделители тысяч; символ — из getCurrencySymbol (валюта студии).
const LOCALE: Record<string, string> = { RUB: 'ru-RU', USD: 'en-US', EUR: 'de-DE', KZT: 'ru-KZ' };

export function localeForCurrency(currency = 'RUB'): string {
  return LOCALE[currency] ?? 'ru-RU';
}

// amount — в основной единице (уже /100). currency — код валюты студии (useStudioCurrency).
// Копейки печатаем ТОЛЬКО когда они есть: половинная цена комбо (39/2 = 19.5)
// иначе выводилась дефолтным форматом как «19,5», а с minimumFractionDigits: 2
// целые тарифы превратились бы в «39,00». Дробное → две цифры, целое → без хвоста.
export function formatMoney(amount: number, currency = 'RUB'): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  const value = amount.toLocaleString(localeForCurrency(currency), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${getCurrencySymbol(currency)}${value}`;
}
