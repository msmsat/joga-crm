export interface LoyaltyConfig {
  is_enabled: boolean
  program_name: string
  points_exchange_rate: number
  expiry_period: number | null
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
  points_balance: number
  total_spent: number
  level_id: number | null
  created_at: string
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

export interface SubscriptionPackage {
  id: number
  name: string
  class_count: number
  price: number
  per_visit_price: number
  is_active: boolean
  sort_order: number
}
