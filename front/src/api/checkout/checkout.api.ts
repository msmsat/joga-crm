import { client } from '../client'
import type {
  CheckoutCalculateRequest, CheckoutCalculateResult, CheckoutConfirmResult,
  CheckoutPayRequest, CheckoutPayResult, CheckoutService, CheckoutSessionResult,
} from './checkout.types'

export const checkoutApi = {
  calculate: (payload: CheckoutCalculateRequest) =>
    client.post<CheckoutCalculateResult>('/checkout/calculate', payload),

  pay: (payload: CheckoutPayRequest) =>
    client.post<CheckoutPayResult>('/checkout/pay', payload),

  // Оплата картой: деньги двинутся только после подтверждения от Stripe.
  createSession: (payload: CheckoutPayRequest) =>
    client.post<CheckoutSessionResult>('/checkout/session', payload),

  confirm: (sessionId: string) =>
    client.post<CheckoutConfirmResult>('/checkout/confirm', { session_id: sessionId }),

  getServices: () =>
    client.get<CheckoutService[]>('/checkout/services'),
}
