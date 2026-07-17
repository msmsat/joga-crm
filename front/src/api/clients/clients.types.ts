// ─── Вложенные ────────────────────────────────────────────────────────────────

export interface ActiveSubscription {
  used: number
  total: number
  expires_at: string
  type: string
}

export interface ClientNote {
  id: number
  text: string
  created_at: string
  updated_at: string | null
}

export interface CategoryStat {
  key: string
  label: string
  count: number
}

export interface EventRecord {
  date: string | null
  type: 'payment' | 'visit' | 'freeze'
  title: string
  trainer: string | null
  paid: string | null
  amount: string | null
}

export interface ActivityPoint {
  month: string // 'YYYY-MM'
  visits: number
  payments_total: number
}

// ─── Основные сущности ────────────────────────────────────────────────────────

export interface ClientListItem {
  id: number
  name: string
  last_name: string | null
  phone: string | null
  email: string | null
  avatar_color: string | null
  status: 'new' | 'active' | 'vip' | 'inactive' | 'frozen'
  tags: string[]
  visit_count: number
  total_spent: number
  active_subscription: ActiveSubscription | null
  loyalty_points: number
  last_visit_date: string | null
  registration_date: string | null
}

export interface ClientProfile extends ClientListItem {
  birth_date: string | null
  city: string | null
  source: string | null
  notifs_enabled: boolean
  reminders_enabled: boolean
  is_active: boolean
  notes: ClientNote[]
}

// ─── Входящие данные ──────────────────────────────────────────────────────────

export interface ClientCreate {
  name: string
  last_name?: string | null
  phone?: string | null
  email?: string | null
  birth_date?: string | null
  city?: string | null
  tags?: string[]
  note?: string | null
  source?: string | null
}

export interface ClientsListParams {
  search?: string
  status?: string
  category?: string
  tag?: string
  offset?: number
  limit?: number
}

export interface ClientsPage<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

// ─── Ответы ───────────────────────────────────────────────────────────────────

export interface ClientsCountOut {
  count: number
}

export interface OkOut {
  ok: boolean
}

export interface OkFrozenOut {
  ok: boolean
  frozen: boolean
}

export interface TagsOut {
  tags: string[]
}

export interface ClientCreatedOut {
  id: number
  message: string
}

export interface NoteCreatedOut {
  id: number
  text: string
  created_at: string
}

export interface BookingCreatedOut {
  id: number
  message: string
}

export interface ActionMessageOut {
  ok: boolean
  message: string
}

export interface PointsBalanceOut {
  points_balance: number
}
