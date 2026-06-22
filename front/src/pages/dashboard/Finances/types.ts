export const FINANCE_TABS = [
  'Счета и кассы', 'Операции', 'Контрагенты', 'Документы',
  'Онлайн-платежи', 'Методы оплаты', 'Отчёты', 'Цели',
] as const;

export type Tab = typeof FINANCE_TABS[number];
export type ToastType = 'success' | 'error' | 'info';

export interface AccountItem {
  id: number;
  name: string;
  type: string;
  balance: number;
  change: number;
  color: string;
  isSystem: boolean;
}

export interface Operation {
  id: number;
  type: 'income' | 'expense';
  title: string;
  client: string;
  amount: number;
  date: string;
  category: string;
  method: string;
  status: 'completed' | 'pending';
  account?: string;
}

export interface Counterparty {
  id: number;
  name: string;
  type: string;
  inn: string;
  category: string;
  balance: number;
  deals: number;
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
}

export interface OnlineChannel {
  id: number;
  name: string;
  desc: string;
  icon: string;
  active: boolean;
  amount: number;
  sessions: number;
}

export interface PaymentMethod {
  id: number;
  name: string;
  desc: string;
  icon: string;
  enabled: boolean;
  commission: string;
  transactions: number;
}

export interface Goal {
  id: number;
  title: string;
  target: number;
  current: number;
  deadline: string;
  category: string;
  color: string;
  priority: string;
  trackingMode?: 'auto' | 'manual';
}
