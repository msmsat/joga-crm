import { getCurrencySymbol } from '../components/UI';

// Локаль влияет только на разделители тысяч; символ — из getCurrencySymbol (валюта студии).
// По умолчанию и для незнакомой валюты — de-DE: пробел-разделитель тысяч и
// запятая в дробной части, как в континентальной Европе. Раньше здесь была
// ru-RU, и студия в Праге видела рублёвое форматирование.
const LOCALE: Record<string, string> = {
  EUR: 'de-DE', USD: 'en-US', GBP: 'en-GB', CZK: 'cs-CZ', CHF: 'de-CH',
  UAH: 'uk-UA', RUB: 'ru-RU', KZT: 'ru-KZ',
};

export function localeForCurrency(currency = 'EUR'): string {
  return LOCALE[currency] ?? 'de-DE';
}

// amount — в основной единице (уже /100). currency — код валюты студии (useStudioCurrency).
// Копейки печатаем ТОЛЬКО когда они есть: половинная цена комбо (39/2 = 19.5)
// иначе выводилась дефолтным форматом как «19,5», а с minimumFractionDigits: 2
// целые тарифы превратились бы в «39,00». Дробное → две цифры, целое → без хвоста.
export function formatMoney(amount: number, currency = 'EUR'): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  const value = amount.toLocaleString(localeForCurrency(currency), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${getCurrencySymbol(currency)}${value}`;
}
