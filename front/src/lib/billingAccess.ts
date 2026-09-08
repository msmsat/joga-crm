import type { BillingPlan } from '../api/billing/billing.types';

type AccessPlan = Pick<BillingPlan, 'billing_mode' | 'status' | 'expires_at'>;

// Процент — постоплата, поэтому статус и срок старой подписки его не блокируют.
// Просроченную комиссию по-прежнему проверяет сервер и возвращает 402.
export function hasBillingAccess(plan: AccessPlan, now = Date.now()): boolean {
  if (plan.billing_mode === 'percent') return true;
  if (!['active', 'trial', 'past_due'].includes(plan.status) || !plan.expires_at) return false;
  // Бэкенд хранит UTC без суффикса; браузер иначе прочитает дату в локальном поясе.
  const iso = /(?:Z|[+-]\d{2}:\d{2})$/i.test(plan.expires_at)
    ? plan.expires_at : `${plan.expires_at}Z`;
  return new Date(iso).getTime() >= now;
}

export function billingStatusKey(plan: AccessPlan): string {
  if (plan.billing_mode === 'percent') return 'header.active';
  if (plan.status === 'none') return 'header.noPlan';
  if (!hasBillingAccess(plan)) return 'header.unpaid';
  if (plan.status === 'past_due') return 'header.awaitingPayment';
  return plan.status === 'trial' ? 'header.trial' : 'header.active';
}
