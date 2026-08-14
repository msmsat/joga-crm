// 1:1 с back/schemas/settings/billing.py — бэкенд диктует структуру.

export interface PlanLimits {
  staff: number | null   // null = безлимит (business)
  clients: number | null
  ai_requests: number | null   // обращений к ИИ в месяц; у Business это число, а не безлимит
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
  // Ставка НДС для подписи итога на шаге оплаты, %. Цены выше — БЕЗ налога.
  // Ориентир, а не расчёт: настоящую сумму считает Stripe Tax по стране студии.
  vat_rate: number
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
  /** Есть ли живая подписка Stripe — считает сервер (checkout._has_live_subscription).
   *  Выводить это из одного `status` нельзя: у студии, оплатившей по старой схеме или
   *  потерявшей подписку при смене ключа Stripe, статус активен, а подписки нет —
   *  интерфейс предлагал отложенный переход, а сервер отвечал обычной ссылкой оплаты
   *  и уносил владельца на Stripe мимо выбора способа оплаты. */
  has_live_subscription: boolean
  /** Открыта ли ещё акция «14 дней бесплатно». Считает сервер тем же правилом,
   *  по которому пускает POST /billing/trial (router._trial_available). Своей
   *  проверки у фронта быть не должно: выводить её из `status` уже было ошибкой —
   *  Stripe уводит статус в pending/expired ещё до всякой оплаты, и кнопка
   *  пропадала у того, кто просто открыл оформление и передумал. */
  trial_available: boolean
}

/** Длина пробного периода в днях — только для текста «14 дней бесплатно».
 *  Источник истины — back/routers/billing/plans.py:TRIAL_DAYS, срок ставит
 *  сервер; здесь копия, чтобы не тянуть каталог тарифов ради одного числа в
 *  окне. Меняете там — поменяйте и тут (та же цифра стоит на лендинге). */
export const TRIAL_DAYS = 14

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

/** Реквизиты плательщика. Лежат на АККАУНТЕ, а не на студии: у второй студии
 *  того же владельца адрес тот же, и спрашивать его заново незачем. */
export interface BillingProfile {
  country: string | null       // ISO 3166-1 alpha-2
  line1: string | null
  line2: string | null
  postal_code: string | null
  city: string | null
  vat_id: string | null
  /** Заполнено ли обязательное — считает сервер (checkout._PROFILE_REQUIRED).
   *  Дублировать список обязательных полей на фронте нельзя: он разъедется. */
  filled: boolean
}

/** Тело формы: обязательно всё, кроме второй строки адреса и номера НДС. */
export interface BillingProfileInput {
  country: string
  line1: string
  line2?: string | null
  postal_code: string
  city: string
  vat_id?: string | null
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
  // Поля `apply` нет: переход всегда немедленный, с зачётом остатка текущего
  // периода. Отложенный переход «с начала следующего периода» убран.
  /** Покупается модель «фикс + процент» (половинный фикс + % с оборота).
   *  Режим поднимает ОПЛАТА, поэтому до неё выбор живёт только в этом поле. */
  combo?: boolean
}

export interface CheckoutResponse {
  /** null — платить нечего: переход уже применён, вести владельца некуда. */
  checkout_url: string | null
}

/** Расчёт для модалки оплаты: что спишется, что зачтётся, что сгорит.
 *  Суммы в копейках и БЕЗ налога — его считает Stripe Tax на своей странице. */
export interface CheckoutPreview {
  /** new — подписки нет; renewal — тот же тариф, месяцы прибавляются к сроку;
   *  switch — смена тарифа с зачётом неиспользованного остатка. */
  kind: 'new' | 'renewal' | 'switch'
  current_plan: string | null
  gross: number     // полная цена выбранного тарифа за период
  credit: number    // зачёт остатка текущего тарифа
  total: number     // к оплате сейчас = max(0, gross − credit)
  burned: number    // сколько остатка сгорит (переход на тариф дешевле)
  currency: string
  /** true — Stripe не ответил, зачёт в расчёт не попал: показана полная цена. */
  estimated: boolean
  /** До какой даты подписка не берёт денег (ISO): уже оплаченный остаток триала
   *  или прежнего периода. null — списывают сразу. */
  free_until: string | null
  /** Сколько дней до первого списания — считает сервер, теми же часами. */
  free_days: number
}
