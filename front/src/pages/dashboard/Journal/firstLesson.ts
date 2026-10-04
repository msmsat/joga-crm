// Размер скидки первого занятия одной меткой — «−50%» или «−300 Kč». Одна
// функция на выключатель окна оплаты, тег шага оплаты записи и бейдж в списке
// клиентов: разойдись они, одна и та же скидка читалась бы по-разному.
import { formatMoney } from '../../../lib/money';

/** Скидка суммой и процентом взаимоисключающие: у скидки суммой процента нет.
 *  `free` — подпись подарка (100 %); сумма подарком не бывает, её покрытие
 *  решает цена занятия. */
export function firstLessonOff(
  percent: number | null | undefined,
  amount: number | null | undefined,
  currency: string | undefined,
  free: string,
): string {
  if (amount != null) return `−${formatMoney(amount, currency)}`;
  const value = percent ?? 100;
  return value >= 100 ? free : `−${value}%`;
}
