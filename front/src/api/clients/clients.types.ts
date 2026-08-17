// ─── Вложенные ────────────────────────────────────────────────────────────────

export interface ActiveSubscription {
  used: number
  total: number
  expires_at: string
  type: string
}

/**
 * Купленный продукт клиента — абонемент или разовое занятие (у разового
 * total === 1, в БД это тот же ClientSubscription).
 */
export interface ClientProduct extends ActiveSubscription {
  id: number
  is_frozen: boolean
  /** Куплен поверх незаконченного: срок начнётся с первого посещения, expires_at пока условный. */
  is_pending: boolean
  starts_at: string | null
}

// GET /clients/{id}/wallet (CL-6.5) — полная форма абонемента, как отдаёт бэк
// (ClientSubscriptionRead), в отличие от урезанной ActiveSubscription в профиле.
export interface WalletSubscription {
  id: number
  type: string
  total_classes: number
  used_classes: number
  remaining: number
  expires_at: string
  status: string
  is_frozen: boolean
}

export interface ClientWallet {
  active: WalletSubscription[]
  archived: WalletSubscription[]
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

/** Пороги, по которым считаются категории клиентов (back/services/client_segments.py). */
export interface SegmentRules {
  new_client_days: number
  active_within_days: number
  vip_min_spent: number
  vip_min_visits: number
}

export interface EventRecord {
  date: string | null
  type: 'payment' | 'visit' | 'booking' | 'cancel' | 'bonus' | 'freeze'
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

/** Уровень клиента в программе лояльности — тот же, что он видит в «Клубе». */
export interface ClientLoyaltyLevel {
  name: string
  color: string
  /** Сколько денег даёт один балл на этом уровне. */
  point_value: number
  /** Баланс баллов в деньгах по этой цене. */
  points_value: number
  next_name: string | null
  /** Сколько ещё потратить до следующей ступени. */
  to_next: number | null
  next_point_value: number | null
}

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
  products: ClientProduct[]
  loyalty_points: number
  /** null — у студии нет лестницы уровней. */
  loyalty_level: ClientLoyaltyLevel | null
  last_visit_date: string | null
  registration_date: string | null
}

export interface ClientProfile extends ClientListItem {
  subscription_alert: ActiveSubscription | null
  birth_date: string | null
  city: string | null
  source: string | null
  notifs_enabled: boolean
  reminders_enabled: boolean
  is_active: boolean
  /** Сумма неоплаченных занятий («оплата на месте»). 0 — клиент ничего не должен. */
  debt: number
  /** Номер подтверждён Telegram, а не введён руками — по нему точно дозвонятся. */
  phone_verified: boolean
  notes: ClientNote[]
}

// ─── Входящие данные ──────────────────────────────────────────────────────────

export interface ClientCreate {
  name: string
  last_name?: string | null
  phone: string
  email: string
  birth_date?: string | null
  city: string
  tags?: string[]
  note?: string | null
  source?: string | null
  membership_id?: number | null
  is_membership_paid?: boolean
  invite_code?: string | null
}

export interface InviteCode {
  invite_code: string
}

export interface ClientUpdate {
  name?: string
  last_name?: string | null
  phone?: string | null
  email?: string | null
  birth_date?: string | null
  city?: string | null
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
