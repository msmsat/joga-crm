export type CheckoutProductType = 'subscription' | 'single'

export interface CheckoutCalculateRequest {
  client_id: number
  product_id: number
  product_type: CheckoutProductType
  /** Кто оказывает услугу — от этого зависит её цена. Осмыслен только для
   *  'single'. Не прислали — базовая цена услуги. */
  teacher_id?: number | null
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
  /** Сколько БАЛЛОВ списано. */
  bonuses_applied: number
  /** Сколько ДЕНЕГ они сняли: на уровне с point_value=2 это вдвое больше баллов. */
  bonuses_value: number
  /** Цена одного балла на уровне этого клиента. */
  point_value: number
  deposit_available: number
  deposit_applied: number
  certificate_applied: number
  total_price: number
}

export interface CheckoutPayRequest {
  client_id: number
  product_id: number
  product_type: CheckoutProductType
  /** См. CheckoutCalculateRequest.teacher_id. Цену по нему сервер считает
   *  заново и здесь: присланному с фронта итогу касса не доверяет. */
  teacher_id?: number | null
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
  bonuses_value: number
  deposit_applied: number
  certificate_applied: number
  subscription_id: number | null
}

export interface CheckoutSessionResult {
  /** Секрет сессии для встроенной формы Stripe. Не путать с секретным ключом. */
  client_secret: string
  session_id: string
  publishable_key: string
  /** acct_… студии: Stripe.js обязан подняться с тем же аккаунтом, иначе не найдёт сессию. */
  account_id: string
}

export interface CheckoutConfirmResult {
  /** true — оплата проведена в CRM (этим вызовом или раньше вебхуком). */
  paid: boolean
}

export interface CheckoutServiceMaster {
  user_id: number
  name: string
  price: number
}

export interface CheckoutService {
  id: number
  name: string
  price: number
  // Пока кассир не выбрал мастера, точной цены у услуги нет: у разных мастеров
  // она своя. Касса пишет «от price_min до price_max», а выбор мастера из
  // `masters` превращает диапазон в сумму (back/services/service_pricing.py).
  price_min: number
  price_max: number
  masters: CheckoutServiceMaster[]
  duration_min: number
}
