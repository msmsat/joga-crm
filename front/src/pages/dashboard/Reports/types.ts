export type Period = 'day' | 'week' | 'month' | 'year';

export type Tab = 'Основные' | 'По продажам' | 'По тренерам' | 'По услугам' | 'Все' | 'События';

export interface CandleTooltipData {
  month: string;
  val: number;
  pct: number;
  sessions: number;
  clients: number;
  period: Period;
}

export interface TrainerRecord {
  name: string;
  role: string;
  sessions: number;
  revenue: number;
  rating: number;
  retention: number;
  color: string;
}

export interface ServiceRecord {
  name: string;
  sessions: number;
  revenue: number;
  share: number;
  color: string;
  trend: string;
}

export interface SalesBuyerPayment {
  label: string;
  pct: number;
  color: string;
}

export interface SalesRecord {
  label: string;
  count: number;
  revenue: number;
  avg: number;
  badge: string;
  buyers: { newPct: number; retPct: number };
  payments: SalesBuyerPayment[];
}

export interface EventRecord {
  date: string;
  title: string;
  type: string;
  attendees: number;
  revenue: number | null;
  status: string;
  color: string;
}
