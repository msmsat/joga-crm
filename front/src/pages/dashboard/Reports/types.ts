export type {
  Insight,
  Kpi,
  ClientDynamics,
  OverviewKpiSet,
  OverviewRead,
  RevenueStructureRow,
  SeriesPoint,
  BuyerTypeGroup,
  BuyerTypeSlice,
  CategorySlice,
  MethodSlice,
  ProductRow,
  SalesKpiSet,
  SalesRead,
  SalesSeriesPoint,
} from '../../../api/analytics/analytics.types';

export type Tab = 'overview' | 'sales' | 'clients' | 'team' | 'schedule';

// Период тулбара/фильтров новых Отчётов. Не путать с Period ниже — тот
// остаётся под старые mock-вкладки (Record<Period,...> без 'custom').
export type ReportPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface ReportFilters {
  period: ReportPeriod;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  branchId: number | null;
  hallId: number | null;
  trainerId: number | null;
  serviceId: number | null;
}

export interface ReportFiltersParams {
  date_from: string;
  date_to: string;
  branch_id?: number;
  hall_id?: number;
  trainer_id?: number;
  service_id?: number;
}

/** @deprecated под старые mock-вкладки; новый тулбар использует ReportPeriod */
export type Period = 'day' | 'week' | 'month' | 'year';

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
