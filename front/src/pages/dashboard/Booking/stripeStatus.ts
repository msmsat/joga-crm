import type { Gateway } from '../../../api/finances/finances.types'

export type StripeGateState = 'loading' | 'none' | 'incomplete' | 'requiresInfo' | 'pending' | 'paused' | 'ready' | 'unavailable' | 'unconfigured'

/** Never infer an absent account from a failed request or unknown Stripe status. */
export function stripeGateState(gateway: Gateway | undefined, loading: boolean, failed: boolean): StripeGateState {
  if (loading) return 'loading'
  if (failed) return 'unavailable'
  if (gateway?.platform_configured === false) return 'unconfigured'
  if (gateway?.status_available === false) return 'unavailable'
  if (!gateway?.account_id) return 'none'
  if (gateway.requirements_due) return 'requiresInfo'
  if (gateway.charges_enabled) return gateway.is_active ? 'ready' : 'paused'
  return gateway.details_submitted ? 'pending' : 'incomplete'
}

export const STRIPE_REFRESH_KEY = 'velora:stripe-link-refresh:'
