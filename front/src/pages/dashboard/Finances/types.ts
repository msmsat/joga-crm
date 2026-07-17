export const FINANCE_TABS = [
  'Счета и кассы', 'Операции', 'Зарплаты', 'Контрагенты', 'Документы',
  'Онлайн-платежи', 'Методы оплаты', 'Отчёты', 'Цели',
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

