export interface DailyMetric {
  date: string
  revenue: number
  new_clients: number
  total_bookings: number
  cancelled_bookings: number
  retention_rate: number
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
