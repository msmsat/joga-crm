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

// ─── R3: вкладка «Клиенты» ─────────────────────────────────────────────────
export interface ClientsKpiSet {
  new: Kpi
  returned: Kpi
  lost: Kpi
  retention_pct: Kpi
  avg_value: Kpi
}

export interface WeeklyPoint {
  period: string
  new: number
  returned: number
}

export interface SegmentCount {
  key: string
  count: number
}

export interface SegmentClientRow {
  id: number
  name: string
  last_name: string | null
  phone: string | null
  last_visit_date: string | null
  value: number | null
}

export interface ClientsReportRead {
  kpi: ClientsKpiSet
  weekly: WeeklyPoint[]
  risk_segments: SegmentCount[]
  loyal_segments: SegmentCount[]
  insights: Insight[]
}

// ─── R4: вкладка «Команда» ─────────────────────────────────────────────────
export interface TeamKpiSet {
  lessons_count: Kpi
  revenue_per_hour: Kpi
  avg_fill_pct: Kpi
  cancel_noshow_pct: Kpi
  avg_rating: Kpi
}

export interface TrainerRow {
  trainer_id: number
  name: string
  lessons: number
  fill_pct: number
  attendance: number
  revenue: number
  return_rate_pct: number
  cancels: number
  noshows: number
  rating: number | null
  load_pct: number
}

export interface TeamRead {
  kpi: TeamKpiSet
  trainers: TrainerRow[]
  insights: Insight[]
}

export interface TrainerLoadPoint {
  weekday: number
  lessons: number
  fill_pct: number
}

export interface TrainerTopLesson {
  name: string
  held: number
  attendance: number
  fill_pct: number
}

export interface TrainerDetailRead {
  revenue_series: SeriesPoint[]
  load_by_weekday: TrainerLoadPoint[]
  top_lessons: TrainerTopLesson[]
  return_rate_pct: number
  returned_clients: number
  total_clients: number
}

// ─── R5: вкладка «Расписание» ──────────────────────────────────────────────
export interface UtilizationKpiSet {
  avg_fill_pct: Kpi
  free_spots: Kpi
  cancels: Kpi
  noshows: Kpi
  lost_revenue: Kpi
}

export interface HeatmapCell {
  weekday: number
  hour: number
  fill_pct: number
  lessons: number
  attendance: number
}

export interface LessonSliceRow {
  name: string
  revenue: number
  held: number
  fill_pct: number
}

export interface ChronicLowRow {
  name: string
  weekday: number
  hour: number
  fill_pct: number
  weeks: number
  lesson_ids: number[]
}

export interface HallUtilRow {
  hall_id: number
  name: string
  fill_pct: number
  evening_idle_pct: number
}

export interface UtilizationRead {
  kpi: UtilizationKpiSet
  heatmap: HeatmapCell[]
  top_profitable: LessonSliceRow[]
  top_filled: LessonSliceRow[]
  chronic_low: ChronicLowRow[]
  halls: HallUtilRow[]
  insights: Insight[]
}

export interface SlotLessonRow {
  id: number
  date: string
  name: string
  teacher_name: string
  hall: string | null
  occupied: number
  total_spots: number
  status: string
}
