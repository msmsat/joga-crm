/**
 * Сумма из чека записи — числом в валюте студии, поэтому знак и разряды
 * ставятся здесь, языком интерфейса. Остальные суммы витрины сервер присылает
 * готовыми строками (`price_str`); у чека `payment-preview` их нет — он считает
 * на каждый введённый код, и строки удвоили бы ответ.
 */
// Создание Intl.NumberFormat дорогое (миллисекунды на телефоне), а пар
// «язык + валюта» в сеансе — одна-две. Витрина абонементов зовёт это на
// каждой пролистанной карте.
const formats = new Map<string, Intl.NumberFormat>();

export function money(amount: number, currency: string, locale: string): string {
  try {
    const key = `${locale}|${currency}`;
    let format = formats.get(key);
    if (!format) {
      format = new Intl.NumberFormat(locale, {
        style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0, minimumFractionDigits: 0,
      });
      formats.set(key, format);
    }
    return format.format(amount);
  } catch {
    // Неизвестный код валюты — число и код как есть, а не пустота.
    return `${amount} ${currency}`;
  }
}
