import { client } from '../client'
import type {
  PlansCatalog, BillingPlan, Invoice, PaymentCard,
  CheckoutRequest, CheckoutResponse, RenewResponse,
} from './billing.types'

export const billingApi = {
  getPlans: () =>
    client.get<PlansCatalog>('/billing/plans'),

  getPlan: () =>
    client.get<BillingPlan>('/billing/plan'),

  getInvoices: () =>
    client.get<Invoice[]>('/billing/invoices'),

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
}
