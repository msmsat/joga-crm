import { client, downloadFile, openFile } from '../client'
import type {
  PlansCatalog, BillingPlan, Invoice, InvoicesPage, PaymentCard, BillingStats,
  CheckoutRequest, CheckoutResponse, RenewResponse,
  ActivateModelRequest, IbanCheckout, AutopaySettings,
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

  openReceipt: (id: number) =>
    openFile(`/billing/invoices/${id}/receipt.pdf`),

  // Сверка статуса счёта с платёжным сервисом, когда вебхук не дошёл: возвращает счёт как есть в БД.
  syncInvoice: (id: number) =>
    client.post<Invoice>(`/billing/invoices/${id}/sync`, {}),

  getPaymentCards: () =>
    client.get<PaymentCard[]>('/billing/cards'),

  // Оплата через ссылку Stripe: сумму считает сервер, редирект на checkout_url.
  checkout: (plan: CheckoutRequest['plan'], period_months: CheckoutRequest['period_months']) =>
    client.post<CheckoutResponse>('/billing/checkout', { plan, period_months }),

  // Продление по сохранённой карте (rectoken) — статус придёт в вебхук.
  renew: () =>
    client.post<RenewResponse>('/billing/renew', {}),

  refundInvoice: (id: number) =>
    client.post<void>(`/billing/invoices/${id}/refund`, {}),

  // Переключение тарифной модели (подписка / % / фикс+%) — без разового платежа.
  activateModel: (body: ActivateModelRequest) =>
    client.post<BillingPlan>('/billing/model', body),

  // IBAN-ветка: без редиректа на Stripe, возвращает тестовый IBAN + инвойс для модалки.
  checkoutIban: (plan: CheckoutRequest['plan'], period_months: CheckoutRequest['period_months']) =>
    client.post<IbanCheckout>('/billing/checkout/iban', { plan, period_months }),

  updateAutopay: (patch: Partial<AutopaySettings>) =>
    client.patch<BillingPlan>('/billing/autopay', patch),
}
