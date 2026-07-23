export type CheckoutProductType = 'subscription' | 'single'

export interface CheckoutCalculateRequest {
  client_id: number
  product_id: number
  product_type: CheckoutProductType
  promo_code?: string | null
  use_bonuses?: boolean
  use_deposit?: boolean
  certificate_code?: string | null
}

export interface CheckoutCalculateResult {
  base_price: number
  discount: number
  promo_valid: boolean
  bonuses_available: number
  bonuses_applied: number
  deposit_available: number
  deposit_applied: number
  certificate_applied: number
  total_price: number
}

export interface CheckoutPayRequest {
  client_id: number
  product_id: number
  product_type: CheckoutProductType
  // Не указан → бэк сам возьмёт/создаст дефолтный счёт «Основная касса» (V5-6, 2.1).
  account_id?: number
  promo_code?: string | null
  use_bonuses?: boolean
  use_deposit?: boolean
  certificate_code?: string | null
  payment_method: 'cash' | 'card'
}

export interface CheckoutPayResult {
  total_price: number
  bonuses_applied: number
  deposit_applied: number
  certificate_applied: number
  subscription_id: number | null
}

export interface CheckoutService {
  id: number
  name: string
  price: number
  duration_min: number
}
