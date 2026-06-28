import type { Invoice, BillingPlan } from '../../../api/billing/billing.types';
export type { Invoice, BillingPlan };

export type BillingMode = 'subscription' | 'percent' | 'fixed';
export type PlanType = 'start' | 'pro' | 'business';
export type BillingTab = 'plans' | 'invoices' | 'method';

export interface Feature {
  text: string;
  on: boolean;
}
