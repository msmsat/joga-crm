import { client } from '../client'
import type {
  CheckoutCalculateRequest, CheckoutCalculateResult, CheckoutPayRequest, CheckoutPayResult, CheckoutService,
} from './checkout.types'

export const checkoutApi = {
  calculate: (payload: CheckoutCalculateRequest) =>
    client.post<CheckoutCalculateResult>('/checkout/calculate', payload),

  pay: (payload: CheckoutPayRequest) =>
    client.post<CheckoutPayResult>('/checkout/pay', payload),

  getServices: () =>
    client.get<CheckoutService[]>('/checkout/services'),
}
