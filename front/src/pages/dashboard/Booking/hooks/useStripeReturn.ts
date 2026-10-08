import { useEffect, useRef } from 'react'
import { getActiveContextKey, getActiveToken, getUserRoleFromToken } from '../../../../utils/auth'
import type { Gateway } from '../../../../api/finances/finances.types'
import { STRIPE_REFRESH_KEY } from '../stripeStatus'

interface Options {
  refetch(): Promise<{ data?: Gateway[]; isError: boolean }>
  connectStripe(path?: string): void
}

export function useStripeReturn({ refetch, connectStripe }: Options) {
  const handled = useRef(false)
  useEffect(() => {
    if (handled.current) return
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('stripe')
    if (flag !== 'return' && flag !== 'refresh') return
    handled.current = true
    params.delete('stripe')
    const rest = params.toString()
    window.history.replaceState(window.history.state, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
    // Read fresh status first. An expired link may only renew the known studio
    // account; failed authentication/status cannot initiate another connection.
    const context = getActiveContextKey()
    void refetch().then(result => {
      const stripe = result.data?.find(gateway => gateway.gateway_type === 'stripe')
      if (flag !== 'refresh' || result.isError || !stripe?.account_id ||
        stripe.platform_configured === false || stripe.status_available === false ||
        !getActiveToken() || getUserRoleFromToken() !== 'owner' || getActiveContextKey() !== context) return
      const key = STRIPE_REFRESH_KEY + context
      try {
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
      } catch { return } // Manual continuation remains available without storage.
      connectStripe('/dashboard/booking')
    }).catch(() => { /* The query exposes its error and retry in the dialog. */ })
  }, [refetch, connectStripe])
}
