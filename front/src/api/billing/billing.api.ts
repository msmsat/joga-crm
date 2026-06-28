import { client } from '../client'
import type { BillingPlan, Invoice, PaymentCard } from './billing.types'

export const billingApi = {
  getPlan: () =>
    client.get<BillingPlan>('/billing/plan'),

  getInvoices: () =>
    client.get<Invoice[]>('/billing/invoices'),

  getPaymentCards: () =>
    client.get<PaymentCard[]>('/billing/cards'),

  addPaymentCard: (payload: Omit<PaymentCard, 'id'>) =>
    client.post<PaymentCard>('/billing/cards', payload),

  removePaymentCard: (id: number) =>
    client.delete<void>(`/billing/cards/${id}`),

  upgradePlan: (planName: string, billingCycle: string) =>
    client.post<BillingPlan>('/billing/upgrade', { plan_name: planName, billing_cycle: billingCycle }),

  cancelPlan: () =>
    client.post<void>('/billing/cancel', {}),
}
