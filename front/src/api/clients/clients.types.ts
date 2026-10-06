import type { PaymentBreakdown } from '../schedule/schedule.types'

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
  freeze_until?: string | null
  freeze_used_days?: number
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
  freeze_until?: string | null
  freeze_used_days?: number
}

export interface ClientWallet {
  active: WalletSubscription[]
  archived: WalletSubscription[]
}

export interface ClientNote {
  id: number
  text: string
  /** Пути к файлам на бэкенде (/static/notes/…) — показывать через resolveImageUrl. */
  photos: string[]
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
  occurred_at?: string | null
  scheduled_at?: string | null
  recorded_at?: string | null
  type: 'payment' | 'visit' | 'completed' | 'booking' | 'cancel' | 'bonus' | 'freeze'
  lesson_id?: number | null
  notes?: string | null
  photos?: string[]
  status?: string | null
  appointment_status?: 'upcoming' | 'ongoing' | 'completed' | 'cancelled' | null
  attendance_status?: 'expected' | 'attended' | 'missed' | 'unknown' | 'cancelled' | null
  payment_status?: 'paid' | 'unpaid' | 'subscription' | 'free' | 'unknown' | null
  title: string
  /** Lesson or subscription name without the «Запись: »-style prefix of title. */
  subject?: string | null
  /** Freeze rows only: the same type covers freezing and unfreezing. */
  freeze_action?: 'freeze' | 'unfreeze' | null
  trainer: string | null
  paid: string | null
  amount: string | null
}

/** Запись клиента в сводке: attended — пришёл, missed — неявка, upcoming — впереди. */
export interface DigestVisit {
  reservation_id: number
  lesson_id: number
  name: string
  start_time: string
  teacher_name: string | null
  status: 'attended' | 'missed' | 'cancelled' | 'upcoming'
  rating: number | null
  review_text: string | null
  is_trial: boolean
  /** Как записан и чем закрыт — то же, что у строки записанного в Журнале. */
  booked_at: string | null
  price: number
  trial_discount_percent: number | null
  trial_discount_amount: number | null
  subscription_name: string | null
  debt: number
  paid_amount: number
  payment: PaymentBreakdown | null
}

export interface DigestReview {
  rating: number
  text: string | null
  created_at: string
}

/** GET /clients/{id}/digest — всё, что стоит вспомнить о клиенте перед занятием. */
export interface ClientDigest {
  attended: number
  missed: number
  cancelled: number
  upcoming: number
  /** Доля пришедших среди состоявшихся записей, 0…100; null — их ещё не было. */
  attendance_rate: number | null
  avg_rating: number | null
  first_visit: string | null
  last_visit: string | null
  favorite_trainer: string | null
  favorite_lesson: string | null
  next_visit: DigestVisit | null
  history: DigestVisit[]
  reviews: DigestReview[]
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
  avatar_url?: string | null
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
  phone2?: string | null
  address?: string | null
  balance?: string | null
  discount?: string | null
  subscription_alert: ActiveSubscription | null
  /** Ник в Instagram без «@» — ссылку карточка собирает сама. */
  instagram: string | null
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

// Обязательно только имя — контакты и город по желанию (schemas/clients.ClientCreate).
export interface ClientCreate {
  name: string
  last_name?: string | null
  phone?: string | null
  email?: string | null
  instagram?: string | null
  birth_date?: string | null
  city?: string | null
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
  phone2?: string | null
  address?: string | null
  name?: string
  last_name?: string | null
  phone?: string | null
  email?: string | null
  instagram?: string | null
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

/** GET /clients/default-city — догадка по IP для формы нового клиента. */
export interface DefaultCityOut {
  city: string | null
  country: string | null
  source: 'ip' | 'studio' | 'none'
}

export interface NoteCreatedOut {
  id: number
  text: string
  photos: string[]
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
