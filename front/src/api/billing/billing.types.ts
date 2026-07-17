// 1:1 с back/schemas/settings/billing.py — бэкенд диктует структуру.

export interface PlanLimits {
  staff: number | null   // null = безлимит (business)
  clients: number | null
}

export interface Plan {
  id: string             // start | pro | business
  name: string
  price: number          // месячная цена в копейках
  limits: PlanLimits
}

export interface PlansCatalog {
  plans: Plan[]
  period_discounts: Record<number, number>   // {1: 0, 6: 0.20, 12: 0.30, 24: 0.40}
}

export interface BillingPlan {
  plan_name: string
  billing_cycle: string
  status: string
  expires_at: string | null
  max_staff: number
  auto_renewal: boolean
}

export interface Invoice {
  id: number
  plan_name: string
  amount: number
  payment_method: string | null
  paid_at: string | null
  status: string
  pdf_url: string | null
}

export interface PaymentCard {
  id: number
  card_last4: string
  card_brand: string
  card_expiry: string
  cardholder_name: string | null
  is_primary: boolean
}

export interface CheckoutRequest {
  plan: 'start' | 'pro' | 'business'
  period_months: 1 | 6 | 12 | 24
}

export interface CheckoutResponse {
  checkout_url: string
}

export interface RenewResponse {
  invoice_id: number
}
