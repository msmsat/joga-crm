import { client, downloadFile, openFile } from '../client'
import type {
  PlansCatalog, BillingPlan, Invoice, PaymentCard, BillingStats,
  CheckoutRequest, CheckoutResponse, RenewResponse,
  ActivateModelRequest, IbanCheckout, AutopaySettings,
} from './billing.types'

export const billingApi = {
  getPlans: () =>
    client.get<PlansCatalog>('/billing/plans'),

  getPlan: () =>
    client.get<BillingPlan>('/billing/plan'),

  getInvoices: () =>
    client.get<Invoice[]>('/billing/invoices'),

  // Плашки шапки (потрачено / месяцев с нами / сэкономлено / следующее списание) — считает сервер.
  getStats: () =>
    client.get<BillingStats>('/billing/stats'),

  // Серверный CSV всех счетов студии (не только загруженной страницы) — Bearer в заголовке,
  // поэтому не <a href>, а blob-через-fetch (задача B5).
  exportInvoicesCsv: () =>
    downloadFile('/billing/invoices/export.csv'),

  openReceipt: (id: number) =>
    openFile(`/billing/invoices/${id}/receipt.pdf`),

  getPaymentCards: () =>
    client.get<PaymentCard[]>('/billing/cards'),

  // Оплата через ссылку Fondy: сумму считает сервер, редирект на checkout_url.
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

  // IBAN-ветка: без редиректа на Fondy, возвращает тестовый IBAN + инвойс для модалки.
  checkoutIban: (plan: CheckoutRequest['plan'], period_months: CheckoutRequest['period_months']) =>
    client.post<IbanCheckout>('/billing/checkout/iban', { plan, period_months }),

  updateAutopay: (patch: Partial<AutopaySettings>) =>
    client.patch<BillingPlan>('/billing/autopay', patch),
}
