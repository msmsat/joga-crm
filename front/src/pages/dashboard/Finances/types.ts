export const FINANCE_TABS = [
  'accounts', 'operations', 'salaries', 'counterparties', 'documents',
  'onlinePayments', 'paymentMethods', 'reports', 'goals',
] as const;

export type Tab = typeof FINANCE_TABS[number];
export type ToastType = 'success' | 'error' | 'info';

export interface Counterparty {
  id: number;
  name: string;
  counterparty_type: string;
  inn: string | null;
  category: string | null;
  balance: number;
  deals_count: number;
  color: string;
}

export interface FinDocument {
  id: number;
  title: string;
  type: string;
  date: string;
  party: string;
  amount: number;
  status: 'signed' | 'pending' | 'draft';
  ext: string;
  hasFile: boolean;
}

