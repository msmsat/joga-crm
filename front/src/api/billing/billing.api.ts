import { client, downloadFile, openFile } from '../client'
import type {
  PlansCatalog, BillingPlan, Invoice, InvoicesPage, PaymentCard, BillingStats,
  CheckoutRequest, CheckoutResponse, CheckoutPreview,
  ActivateModelRequest, AutopaySettings, OfflineFeeStatus,
  BillingProfile, BillingProfileInput,
} from './billing.types'

// date_from/date_to — YYYY-MM-DD, включительно; общий фильтр для списка (задача 3/6)
// и CSV-экспорта (задача 4/6) — бэк принимает их одинаково у обоих эндпоинтов.
interface InvoiceListParams {
  limit?: number
  offset?: number
  date_from?: string
  date_to?: string
}

function invoiceQuery(params?: InvoiceListParams): string {
  const q = new URLSearchParams()
  if (params?.limit !== undefined) q.set('limit', String(params.limit))
  if (params?.offset !== undefined) q.set('offset', String(params.offset))
  if (params?.date_from) q.set('date_from', params.date_from)
  if (params?.date_to) q.set('date_to', params.date_to)
  const qs = q.toString()
  return qs ? `?${qs}` : ''
}

export const billingApi = {
  getPlans: () =>
    client.get<PlansCatalog>('/billing/plans'),

  getPlan: () =>
    client.get<BillingPlan>('/billing/plan'),

  // Пробный период. Создание студии его больше не начисляет — владелец включает
  // его сам, из окна с акцией на входе в кабинет или с самой страницы тарифа,
  // если окно он закрыл. Второй раз сервер отвечает 409 trial_already_used.
  activateTrial: () =>
    client.post<BillingPlan>('/billing/trial', {}),

  // Пагинация (задача 3) + фильтр по дате оплаты (задача 6): по умолчанию 12
  // (как отдаёт бэк), offset — для догрузки.
  getInvoices: (params?: InvoiceListParams) =>
    client.get<InvoicesPage>(`/billing/invoices${invoiceQuery(params)}`),

  // Плашки шапки (потрачено / месяцев с нами / сэкономлено / следующее списание) — считает сервер.
  getStats: () =>
    client.get<BillingStats>('/billing/stats'),

  // Серверный CSV всех счетов студии (не только загруженной страницы) — Bearer в заголовке,
  // поэтому не <a href>, а blob-через-fetch (задача B5). date_from/date_to — текущий
  // фильтр страницы полной истории (задача 6).
  exportInvoicesCsv: (params?: Pick<InvoiceListParams, 'date_from' | 'date_to'>) =>
    downloadFile(`/billing/invoices/export.csv${invoiceQuery(params)}`),

  // Чек по счёту. Если Stripe уже выдал PDF фактуры — открываем ЕГО: это документ с
  // номером, налогом, VAT ID и IČO, то есть то, что примет бухгалтерия. Наш
  // /receipt.pdf — минимальная заглушка без кириллицы (routers/billing/router.py),
  // она остаётся фолбэком для легаси-счетов без stripe_invoice_id.
  openReceipt: (id: number, pdfUrl?: string | null) =>
    pdfUrl
      ? Promise.resolve(window.open(pdfUrl, '_blank', 'noopener')).then(() => undefined)
      : openFile(`/billing/invoices/${id}/receipt.pdf`),

  // Сверка статуса счёта с платёжным сервисом, когда вебхук не дошёл: возвращает счёт как есть в БД.
  syncInvoice: (id: number) =>
    client.post<Invoice>(`/billing/invoices/${id}/sync`, {}),

  getPaymentCards: () =>
    client.get<PaymentCard[]>('/billing/cards'),

  // Реквизиты плательщика — аккаунта, не студии: гейт на бэке по пользователю,
  // поэтому при переключении студии форма второй раз не спрашивается.
  getBillingProfile: () =>
    client.get<BillingProfile>('/billing/profile'),

  saveBillingProfile: (body: BillingProfileInput) =>
    client.put<BillingProfile>('/billing/profile', body),

  // Оплата через ссылку Stripe: сумму считает сервер, редирект на checkout_url.
  // Переход всегда немедленный, с зачётом остатка текущего периода — выбора
  // «когда применить» больше нет.
  // `combo` — покупается модель «фикс + процент». Раньше её включал отдельный
  // запрос ДО оплаты, то есть она доставалась нажатием кнопки; теперь режим
  // поднимает оплата, и сказать «беру комбо» можно только здесь.
  checkout: (
    plan: CheckoutRequest['plan'],
    period_months: CheckoutRequest['period_months'],
    combo = false,
  ) => client.post<CheckoutResponse>('/billing/checkout', { plan, period_months, combo }),

  // Клиентский портал Stripe: единственное место, где студия может ввести VAT ID
  // после первой покупки (у страницы счёта и у смены тарифа таких полей нет).
  openPortal: () =>
    client.post<CheckoutResponse>('/billing/portal', {}),

  // Расчёт для модалки оплаты ДО платежа: зачёт остатка, итог, что сгорит.
  // Считает Stripe тем же вызовом, которым потом и выставит счёт.
  previewCheckout: (
    plan: CheckoutRequest['plan'],
    period_months: CheckoutRequest['period_months'],
    combo = false,
  ) => client.get<CheckoutPreview>(
    `/billing/checkout/preview?plan=${plan}&period_months=${period_months}&combo=${combo}`,
  ),

  // Продления нет: подписку продлевает Stripe, POST /billing/renew отвечает 410.

  refundInvoice: (id: number) =>
    client.post<void>(`/billing/invoices/${id}/refund`, {}),

  // Переключение тарифной модели (подписка / % / фикс+%) — без разового платежа.
  activateModel: (body: ActivateModelRequest) =>
    client.post<BillingPlan>('/billing/model', body),

  getOfflineFees: () =>
    client.get<OfflineFeeStatus>('/billing/offline-fees'),

  // Досрочная оплата: выставляет счёт на всё накопленное и возвращает ссылку.
  payOfflineFees: () =>
    client.post<OfflineFeeStatus>('/billing/offline-fees/pay', {}),

  updateAutopay: (patch: Partial<AutopaySettings>) =>
    client.patch<BillingPlan>('/billing/autopay', patch),
}
