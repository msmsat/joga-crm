import type { Invoice, BillingPlan } from '../../../api/billing/billing.types';
export type { Invoice, BillingPlan };

export type BillingMode = 'subscription' | 'percent' | 'fixed';
/** id ступени каталога: «s2» … «s20» | «unlimited». Перечислением не описывается —
 *  ступеней два десятка, и список разъехался бы с сервером (back/routers/billing/plans.py). */
export type PlanType = string;
/** Период оплаты в месяцах. Какие бывают — говорит каталог (period_discounts). */
export type PlanPeriod = number;
export type BillingTab = 'plans' | 'invoices' | 'method';
