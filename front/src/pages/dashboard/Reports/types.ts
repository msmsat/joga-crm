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
  revenue: string;
  rating: number;
  retention: number;
  color: string;
  initials: string;
}

export interface ServiceRecord {
  name: string;
  sessions: number;
  revenue: string;
  share: number;
  color: string;
  trend: string;
}

export interface SalesRecord {
  label: string;
  count: number;
  revenue: string;
  avg: string;
  badge: string;
}

export interface EventRecord {
  date: string;
  title: string;
  type: string;
  attendees: number;
  revenue: string;
  status: string;
  color: string;
}
