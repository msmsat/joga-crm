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
