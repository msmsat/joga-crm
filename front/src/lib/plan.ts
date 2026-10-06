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


export interface PlanPriceStep {
  /** Seats reached by adding one place at this price. */
  from: number;
  to: number;
  /** Per-place increase in the same units as the catalog prices. */
  amount: number;
}

/** Group equal adjacent seat-price increases; unlimited is a separate product.
 *  Reading every pair avoids advertising one flat increment for a tiered ladder. */
export function planPriceSteps(tiers: readonly { seats: number | null | undefined; price: number }[]): PlanPriceStep[] {
  const line = tiers.filter((tier): tier is { seats: number; price: number } =>
    typeof tier.seats === 'number' && tier.seats > 0 && Number.isFinite(tier.price),
  ).sort((a, b) => a.seats - b.seats);
  const steps: PlanPriceStep[] = [];
  for (let index = 1; index < line.length; index++) {
    const previous = line[index - 1];
    const current = line[index];
    // A skipped seat count cannot promise that the whole jump buys one place.
    if (current.seats !== previous.seats + 1) continue;
    const amount = current.price - previous.price;
    const last = steps[steps.length - 1];
    if (last?.amount === amount && last.to + 1 === current.seats) last.to = current.seats;
    else steps.push({ from: current.seats, to: current.seats, amount });
  }
  return steps;
}
