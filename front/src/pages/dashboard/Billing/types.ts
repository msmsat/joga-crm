export type BillingMode = 'subscription' | 'percent' | 'fixed';
export type PlanType = 'start' | 'pro' | 'business';
export type BillingTab = 'plans' | 'invoices' | 'method';

export interface Invoice {
  date: string;
  amount: string;
  status: string;
  desc: string;
}

export interface Feature {
  text: string;
  on: boolean;
}
