export interface LoyaltyConfig {
  is_enabled: boolean
  program_name: string
  points_exchange_rate: number
  expiry_period: string
}

export interface DiscountConfig {
  is_enabled: boolean
  discount_type: string
  discount_value: number
  min_purchase_amount: number | null
  applies_to_all_services: boolean
  stackable: boolean
  visible_in_cabinet: boolean
}

export interface CertificateConfig {
  is_enabled: boolean
  cert_type: string
  expiry_days: number
  denominations: number[] | null
  service_id: number | null
}

// Абонементы переехали в Каталог (задача 19) — реэкспорт для страницы Лояльности,
// пока задача 23 не уберёт оттуда раздел целиком.
export type { SubscriptionProgramConfig, SubscriptionPackage } from '../catalog/catalog.types'

export interface ReferralConfig {
  is_enabled: boolean
  referrer_bonus: number
  new_client_discount: number
  trigger_condition: string
  bonus_type: string
}

export interface LoyaltyLevel {
  id: number
  name: string
  color: string
  min_threshold: number
  max_threshold: number | null
  sort_order: number
}

export interface LoyaltyLevelWrite {
  id?: number
  name: string
  color: string
  min_threshold: number
  max_threshold: number | null
  sort_order: number
}

export interface LoyaltyCard {
  id: number
  client_id: number
  client_name: string
  points_balance: number
  total_spent: number
  deposit_balance: number
  level_id: number | null
  created_at: string
}

export interface LoyaltyStats {
  members: number
  points_in_circulation: number
  revenue_from_members: number
  avg_check: number
  program_counters: Record<string, number>
  returned_clients: number
  bonus_cost: number
  roi: number
}

export interface GiftCertificate {
  id: number
  code: string
  amount: number
  cert_type: string
  status: 'active' | 'used' | 'expired'
  recipient_name: string | null
  issued_at: string
  expires_at: string | null
}

export interface PromoCode {
  id: number
  code: string
  discount_type: 'percent' | 'amount'
  value: number
  valid_until: string | null
  usage_limit: number | null
  used_count: number
  is_active: boolean
  created_at: string
}

export interface DepositTransaction {
  id: number
  client_id: number
  amount: number
  description: string
  created_at: string
}

export interface DepositTopClient {
  client_id: number
  client_name: string
  deposit_balance: number
}

export interface DepositStats {
  total_balance: number
  top_clients: DepositTopClient[]
}

// Умные сценарии удержания (V5-4). trigger_params / action_params — свободный
// JSON (пороги), ключи зависят от типа; UI знает, какие поля показывать.
export type ScenarioTrigger = 'inactive_days' | 'low_subscription' | 'birthday' | 'nth_visit' | 'referral'
export type ScenarioAction = 'points' | 'gift_classes' | 'certificate' | 'renewal_offer'
export type ScenarioTemplate = 'win_back' | 'expiring_subscription' | 'birthday_gift' | 'fifth_visit' | 'referral_thanks'

export interface Scenario {
  id: number
  trigger_type: ScenarioTrigger
  trigger_params: Record<string, number>
  action_type: ScenarioAction
  action_params: Record<string, number>
  channel: string
  is_enabled: boolean
  fired_count: number
  last_run_at: string | null
  created_at: string
}

export interface ScenarioUpdate {
  trigger_params?: Record<string, number>
  action_params?: Record<string, number>
  is_enabled?: boolean
}

// Живые сегменты (V5-4) — считаются на лету, не хранятся.
export type SegmentKey = 'at_risk' | 'vip_idle' | 'expiring_subscription' | 'lost_newcomers' | 'upsell_candidates'

export interface SegmentClientPreview {
  client_id: number
  name: string
  days_inactive: number | null
}

export interface Segment {
  key: SegmentKey
  count: number
  preview: SegmentClientPreview[]
}

export interface CampaignResult {
  processed: number
  emails_sent: number
}

export interface RetentionMonth {
  month: string   // "YYYY-MM"
  sold: number
  renewed: number
}

export interface Retention {
  renewal_rate: number
  avg_packages_per_client: number
  has_data: boolean
  months: RetentionMonth[]
}

// Персональная скидка клиента (V5-5, задача 2/7) — реальный объект в БД.
export interface ClientOffer {
  id: number
  client_id: number
  discount_type: 'percent' | 'amount'
  value: number
  reason: 'scenario' | 'manual' | 'campaign'
  scope: 'renewal' | 'any'
  valid_until: string | null
  is_used: boolean
  used_at: string | null
  created_at: string
}

export interface ClientOfferCreate {
  client_id: number
  discount_type: 'percent' | 'amount'
  value: number
  scope?: 'renewal' | 'any'
  valid_until?: string | null
}
