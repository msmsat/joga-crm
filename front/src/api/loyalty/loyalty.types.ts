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
  service_name: string | null
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

export interface LoyaltyCard {
  id: number
  client_id: number
  client_name: string
  points_balance: number
  total_spent: number
  level_id: number | null
  created_at: string
}

export interface LoyaltyStats {
  members: number
  points_in_circulation: number
  revenue_from_members: number
  avg_check: number
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
