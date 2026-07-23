export interface SummaryTrends {
  revenue_pct: number | null
  expenses_pct: number | null
  active_clients_pct: number | null
  bookings_pct: number | null
  retention_pct: number | null
}

export interface PeriodSummary {
  revenue: number
  expenses: number
  profit: number
  avg_check: number
  active_clients: number
  bookings: number
  retention: number
  attendance: number
  trends: SummaryTrends
}

export interface SeriesPoint {
  period: string
  value: number
}

export interface TrainerReportRow {
  trainer_id: number
  name: string
  lessons_count: number
  revenue: number
}

export interface ServiceReportRow {
  service: string
  revenue: number
  share_pct: number
}

export interface StudioReview {
  id: number
  client_id: number | null
  author_name: string
  rating: number
  nps_score: number | null
  text: string | null
  source: string
  created_at: string
}

export interface ActivityLog {
  id: number
  event_type: string
  title: string
  actor_name: string
  entity_type: string | null
  color: string
  created_at: string
}

export interface StudioTask {
  id: number
  text: string
  priority: 'low' | 'medium' | 'high'
  tag: string | null
  is_done: boolean
  done_at: string | null
  created_at: string
}

export interface StudioTaskCreate {
  text: string
  priority?: 'low' | 'medium' | 'high'
  tag?: string | null
}

export interface StudioTaskUpdate {
  text?: string
  priority?: 'low' | 'medium' | 'high'
  tag?: string | null
  is_done?: boolean
}

// ─── Отчёты (5 вкладок, ROADMAP_REPORTS) ──────────────────────────────────
export interface Insight {
  key: string
  severity: 'info' | 'warning' | 'critical'
  params: Record<string, string | number>
  action: string
  action_params: Record<string, string | number>
}

export interface Kpi {
  value: number
  prev_pct: number | null
}

// ─── R1: вкладка «Обзор» ───────────────────────────────────────────────────
export interface RevenueStructureRow {
  category: string
  amount: number
  share_pct: number
}

export interface ClientDynamics {
  new: Kpi
  returned: Kpi
  lost: Kpi
}

export interface OverviewKpiSet {
  revenue: Kpi
  profit: Kpi
  attendance: Kpi
  active_clients: Kpi
  fill_rate: Kpi
}

export interface OverviewRead {
  kpi: OverviewKpiSet
  revenue_structure: RevenueStructureRow[]
  client_dynamics: ClientDynamics
  insights: Insight[]
}

// ─── R2: вкладка «Продажи» ─────────────────────────────────────────────────
export interface SalesKpiSet {
  revenue: Kpi
  sales_count: Kpi
  avg_check: Kpi
  repeat_share_pct: Kpi
  renewals_pct: Kpi
}

export interface CategorySlice {
  category: string
  amount: number
  count: number
  share_pct: number
}

export interface MethodSlice {
  method: string
  amount: number
  count: number
  share_pct: number
}

export interface BuyerTypeGroup {
  amount: number
  count: number
}

export interface BuyerTypeSlice {
  new: BuyerTypeGroup
  returning: BuyerTypeGroup
  no_client: BuyerTypeGroup
}

export interface ProductRow {
  product_id: number | null
  name: string | null
  sold: number
  revenue: number
  avg_check: number
  repeat_share_pct: number
  trend_pct: number | null
}

export interface SalesRead {
  kpi: SalesKpiSet
  by_category: CategorySlice[]
  by_method: MethodSlice[]
  by_buyer_type: BuyerTypeSlice
  products: ProductRow[]
  insights: Insight[]
}

export interface SalesSeriesPoint {
  period: string
  revenue: number
  sales_count: number
}
