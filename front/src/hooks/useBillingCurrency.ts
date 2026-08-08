import { useQuery } from '@tanstack/react-query'
import { billingApi } from '../api/billing/billing.api'
import { queryKeys } from '../api/queryKeys'

// Валюта ПОДПИСКИ (BILLING_CURRENCY Stripe-аккаунта), а не валюта кассы студии:
// тарифы списываются в евро, чем бы студия ни торговала у себя. Раньше суммы
// биллинга подписывались символом из useStudioCurrency() — 39 € показывались как 39 ₽.
// Каталог статичен, поэтому кэш бессрочный; ключ общий с остальными его читателями.
export function useBillingCurrency(): string {
  const { data } = useQuery({
    queryKey: queryKeys.billingPlans,
    queryFn: () => billingApi.getPlans(),
    staleTime: Infinity,
  })
  return data?.currency ?? 'EUR'
}
