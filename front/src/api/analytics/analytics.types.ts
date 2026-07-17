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
