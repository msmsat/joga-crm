export const FINANCE_TABS = [
  'Счета и кассы', 'Операции', 'Зарплаты', 'Контрагенты', 'Документы',
  'Онлайн-платежи', 'Методы оплаты', 'Отчёты', 'Цели',
] as const;

export type Tab = typeof FINANCE_TABS[number];
export type ToastType = 'success' | 'error' | 'info';

export interface AccountItem {
  id: number;
  name: string;
  type: string;
  balance: number;
  daily_change: number;
  color: string;
  is_system: boolean;
}

export interface Operation {
  id: number;
  type: 'in' | 'out';
  title: string;
  client_name?: string;
  client_id: number | null;
  amount: number;
  op_date: string;
  category: string | null;
  method: string | null;
  status: 'completed' | 'pending';
  account_name?: string;
  account_id: number | null;
}

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

export interface Goal {
  id: number;
  title: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  category: string | null;
  color: string;
  priority: string;
  trackingMode?: 'auto' | 'manual';
}

export interface TrainerSalary {
  id: number;
  name: string;
  role: string;
  color: string;
  revenue: number;
  sessions: number;
  hours: number;
  rate: number;
  rate_type: 'hourly' | 'fixed';
  salary: number;
  weeklyData: number[];
  topClass: string;
  rating: number;
}
