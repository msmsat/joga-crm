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
  currency: string                           // валюта подписки (EUR), не валюта кассы студии
  // Минимальный месячный платёж тарифа «только процент», в копейках. Месяц, в
  // котором платформа заработала на студии меньше этой суммы, добирается счётом.
  min_monthly: number
}

export interface BillingPlan {
  plan_name: string
  billing_cycle: string
  status: string
  expires_at: string | null
  max_staff: number
  auto_renewal: boolean
  billing_mode: 'subscription' | 'percent' | 'combo'
  percent_rate: number | null
  fixed_base_amount: number | null
  notify_before_days: number
  notify_before_autocharge: boolean
  email_receipt_enabled: boolean
  sms_notification_enabled: boolean
  can_upgrade: boolean       // считает сервер (эпик 4 задача 2) — фронт не дублирует ветвистость
  next_plan: string | null   // null, если апгрейда нет (% от оборота / максимальный тариф)
  /** Оплаченная, но ещё не наступившая смена тарифа: апгрейд по умолчанию
   *  начинается с конца текущего оплаченного периода. */
  scheduled_plan?: string | null
  scheduled_at?: string | null
}

export interface AutopaySettings {
  auto_renewal: boolean
  email_receipt_enabled: boolean
  notify_before_autocharge: boolean
  sms_notification_enabled: boolean
}

export interface ActivateModelRequest {
  mode: 'subscription' | 'percent' | 'combo'
  plan?: 'start' | 'pro' | 'business'
  period_months?: 1 | 6 | 12 | 24
  /** Согласие на постоплату комиссии. Обязательно для percent/combo — иначе бэк даёт 422. */
  accept_offline_terms?: boolean
}

/** Виджет «Комиссия с офлайн-продаж» в разделе «Тариф и оплата». */
export interface OfflineFeeStatus {
  accrued: number
  accrued_currency: string
  outstanding: number
  currency: string
  due_at: string | null
  days_left: number | null
  suspended: boolean
  hosted_invoice_url: string | null
  rate: number | null
  grace_days: number
}

export interface IbanCheckout {
  invoice_id: number
  invoice_number: string
  iban: string
  amount: number
  reference: string
  beneficiary: string            // держателя счёта называет Stripe — счёт коллекторский
  bic: string | null             // часть банков требует BIC вместе с IBAN
  hosted_invoice_url: string | null   // фактура Stripe: печать, PDF, оплата картой
}

export interface BillingStats {
  total_spent: number          // копейки
  months_with_us: number
  saved: number                // копейки
  next_charge: number          // копейки
  next_charge_at: string | null
}

export interface Invoice {
  id: number
  plan_name: string
  period_months: number
  amount: number          // копейки
  payment_method: string | null
  paid_at: string | null
  status: string
  pdf_url: string | null
}

// Пагинация истории платежей (задача 3). Не назвали `Page<T>` — это имя уже
// занято в staff/finances types.ts и коллизирует в барреле api/index.ts.
export interface InvoicesPage {
  items: Invoice[]
  total: number
  offset: number
  limit: number
}

export interface PaymentCard {
  id: number
  card_last4: string
  card_brand: string
  card_expiry: string
  cardholder_name: string | null
  is_primary: boolean
  method_type: 'card' | 'iban'
}

export interface CheckoutRequest {
  plan: 'start' | 'pro' | 'business'
  period_months: 1 | 6 | 12 | 24
  /** Когда новый тариф вступает в силу. Значимо только при живой подписке:
   *  'period_end' — с конца оплаченного периода, платить сейчас не нужно;
   *  'now' — сразу, остаток текущего периода сгорает без возврата. */
  apply?: 'period_end' | 'now'
}

export interface CheckoutResponse {
  checkout_url: string
  /** true — тариф поставлен в расписание, оплата сейчас не требуется. */
  scheduled?: boolean
  /** Момент вступления нового тарифа в силу (ISO), при scheduled. */
  applies_at?: string | null
}
