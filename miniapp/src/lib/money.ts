/**
 * Сумма из чека записи — числом в валюте студии, поэтому знак и разряды
 * ставятся здесь, языком интерфейса. Остальные суммы витрины сервер присылает
 * готовыми строками (`price_str`); у чека `payment-preview` их нет — он считает
 * на каждый введённый код, и строки удвоили бы ответ.
 */
export function money(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0, minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Неизвестный код валюты — число и код как есть, а не пустота.
    return `${amount} ${currency}`;
  }
}
