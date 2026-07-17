export interface SubscriptionProgramConfig {
  is_enabled: boolean
  allow_freeze: boolean
  allow_transfer: boolean
  auto_renewal: boolean
}

export interface SubscriptionPackage {
  id: number
  name: string
  class_count: number
  price: number
  per_visit_price: number
  is_active: boolean
  sort_order: number
  duration_days: number
  service_ids: number[] | null
}
