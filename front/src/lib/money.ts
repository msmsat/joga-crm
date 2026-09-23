import { getCurrencySymbol } from '../components/UI';

// Локаль влияет только на разделители тысяч; символ — из getCurrencySymbol (валюта студии).
// Разделители — свойство ДЕНЕГ, а не языка интерфейса: «1,234.56» в мексиканском
// песо и «1.234,56» в евро остаются собой, на каком бы языке ни читали кабинет.
// Поэтому локаль подбирается по коду валюты, а не по i18n.language.
//
// По умолчанию и для незнакомой валюты — de-DE: точка-разделитель тысяч и
// запятая в дробной части, как в континентальной Европе. Раньше здесь была
// ru-RU, и студия в Праге видела рублёвое форматирование.
//
// Английские теги там, где у страны свои цифры (en-AE, en-SD, en-LK): 'ar-AE'
// напечатал бы сумму восточноарабскими цифрами — «١٬٢٣٤», — и человек, который
// открыл кабинет по-английски, не прочитал бы собственную выручку.
const LOCALE: Record<string, string> = {
  AED: 'en-AE', ALL: 'sq-AL', AMD: 'hy-AM', AOA: 'pt-AO', ARS: 'es-AR',
  AUD: 'en-AU', AZN: 'az-AZ', BAM: 'bs-BA', BBD: 'en-BB', BGN: 'bg-BG',
  BIF: 'fr-BI', BMD: 'en-BM', BOB: 'es-BO', BRL: 'pt-BR', BSD: 'en-BS',
  BWP: 'en-BW', BYN: 'be-BY', BZD: 'en-BZ', CAD: 'en-CA', CDF: 'fr-CD',
  CHF: 'de-CH', CLP: 'es-CL', COP: 'es-CO', CRC: 'es-CR', CUP: 'es-CU',
  CVE: 'pt-CV', CZK: 'cs-CZ', DJF: 'fr-DJ', DKK: 'da-DK', DOP: 'es-DO',
  EUR: 'de-DE', FJD: 'en-FJ', FKP: 'en-GB', GBP: 'en-GB', GEL: 'ka-GE',
  GHS: 'en-GH', GIP: 'en-GB', GMD: 'en-GM', GNF: 'fr-GN', GTQ: 'es-GT',
  GYD: 'en-GY', HKD: 'en-HK', HNL: 'es-HN', HTG: 'fr-HT', HUF: 'hu-HU',
  ILS: 'he-IL', INR: 'en-IN', ISK: 'is-IS', JMD: 'en-JM', KES: 'en-KE',
  KGS: 'ky-KG', KMF: 'fr-KM', KYD: 'en-KY', KZT: 'ru-KZ', LKR: 'en-LK',
  LRD: 'en-LR', LSL: 'en-LS', MDL: 'ro-MD', MGA: 'fr-MG', MKD: 'mk-MK',
  MOP: 'pt-MO', MUR: 'en-MU', MWK: 'en-MW', MXN: 'es-MX', MYR: 'ms-MY',
  MZN: 'pt-MZ', NAD: 'en-NA', NGN: 'en-NG', NIO: 'es-NI', NOK: 'nb-NO',
  NZD: 'en-NZ', PAB: 'es-PA', PEN: 'es-PE', PGK: 'en-PG', PHP: 'en-PH',
  PKR: 'en-PK', PLN: 'pl-PL', PYG: 'es-PY', RON: 'ro-RO', RSD: 'sr-RS',
  RUB: 'ru-RU', RWF: 'en-RW', SBD: 'en-SB', SCR: 'en-SC', SDG: 'en-SD',
  SEK: 'sv-SE', SGD: 'en-SG', SLE: 'en-SL', SSP: 'en-SS', STN: 'pt-ST',
  SZL: 'en-SZ', TJS: 'ru-TJ', TMT: 'ru-TM', TOP: 'en-TO', TRY: 'tr-TR',
  TTD: 'en-TT', TZS: 'en-TZ', UAH: 'uk-UA', UGX: 'en-UG', USD: 'en-US',
  UYU: 'es-UY', UZS: 'uz-UZ', VES: 'es-VE', VUV: 'fr-VU', WST: 'en-WS',
  XAF: 'fr-CM', XCD: 'en-AG', XOF: 'fr-SN', XPF: 'fr-PF', ZAR: 'en-ZA',
  ZMW: 'en-ZM', ZWG: 'en-ZW',
};

export function localeForCurrency(currency = 'EUR'): string {
  return LOCALE[currency] ?? 'de-DE';
}

// Знак, который кончается буквой или точкой («CHF», «Kč», «дин.», «FCFA»),
// от числа отбивается пробелом: «CHF39» читается как одно слово, «CHF 39» —
// как цена. Знаки-иероглифы (€, ₽, $) прижимаются вплотную, как и прежде.
function glue(symbol: string): string {
  return /[\p{L}.]$/u.test(symbol) ? `${symbol}\u00a0` : symbol;
}

// Число без знака валюты, но с её разделителями. Копейки печатаем ТОЛЬКО когда
// они есть: половинная цена комбо (39/2 = 19.5) иначе выводилась дефолтным
// форматом как «19,5», а с minimumFractionDigits: 2 целые тарифы превратились
// бы в «39,00». Дробное → две цифры, целое → без хвоста.
export function formatAmount(amount: number, currency = 'EUR'): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString(localeForCurrency(currency), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// amount — в основной единице (уже /100). currency — код валюты студии (useStudioCurrency).
export function formatMoney(amount: number, currency = 'EUR'): string {
  return `${glue(getCurrencySymbol(currency))}${formatAmount(amount, currency)}`;
}
