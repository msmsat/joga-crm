/** Тариф — это МЕСТА, а не коробка с именем: id ступени каталога кодирует их
 *  число («s7» = 7 сотрудников, «unlimited» = без ограничений).
 *  Источник истины — back/routers/billing/plans.py. */

/** Мест в ступени: "s7" → 7, "unlimited" → null (безлимит).
 *  undefined — это не ступень каталога: легаси-имя (start/pro/business),
 *  free_trial или вид счёта за комиссию. */
export function planSeats(planId: string): number | null | undefined {
  if (planId === 'unlimited') return null;
  const match = /^s(\d+)$/.exec(planId);
  return match ? Number(match[1]) : undefined;
}

// Достаточно того, что функция возвращает строку: перегрузки TFunction под
// узкую сигнатуру не подходят, а тянуть сюда генерики i18next незачем.
type Translate = (key: any, options?: any) => string;   // eslint-disable-line @typescript-eslint/no-explicit-any

/** Подпись ступени тарифа. Собственных названий у ступеней нет — тариф называют
 *  места, которые он даёт. Легаси-имена и free_trial переводятся по planNames:
 *  в БД лежат оплаченные счета с ними, и в истории они должны читаться. */
export function planLabel(planId: string, t: Translate): string {
  const seats = planSeats(planId);
  if (seats === null) return t('planCards.staffUnlimited');
  if (seats !== undefined) return t('planCards.staffLimit', { count: seats });
  return t(`planNames.${planId}`, planId);
}
