import { useQuery } from '@tanstack/react-query';
import type { Plan } from '../../../../api/billing/billing.types';
import { billingApi } from '../../../../api/billing/billing.api';
import { queryKeys } from '../../../../api/queryKeys';
import { PERIOD_DISCOUNTS_FALLBACK } from '../constants';

const NO_PLANS: Plan[] = [];
// Условия постоплаты до ответа каталога — его текущие значения: модалка согласия
// без цифр бессмысленна, а каталог может не успеть приехать к нажатию плитки.
// Сервер всё равно главнее — он же отвергнет активацию без accept_offline_terms.
const TERMS_FALLBACK = { percent_rate: 3, combo_rate: 1.5, grace_days: 7 };

/**
 * Каталог тарифов — источник истины о ступенях и ценах (правило 6 эпика).
 * Держим его КАК ПРИЕХАЛ: ступеней два десятка, и своего списка id у фронта
 * быть не должно — линия мест рисуется ровно по нему.
 *
 * Кэш общий с useBillingCurrency и бессрочный: каталог статичен. Раньше страница
 * грузила его заново на каждом входе и до ответа рисовала цены нулями.
 */
export function useBillingCatalog() {
  const { data, status } = useQuery({
    queryKey: queryKeys.billingPlans,
    queryFn: () => billingApi.getPlans(),
    staleTime: Infinity,
  });
  return {
    catalog: data?.plans ?? NO_PLANS,
    periodDiscounts: data?.period_discounts ?? PERIOD_DISCOUNTS_FALLBACK,
    // Валюта тарифов (BILLING_CURRENCY Stripe-аккаунта), а не валюта кассы студии:
    // списывают всегда евро, чем бы студия ни торговала у себя.
    currency: data?.currency || 'EUR',
    // Минимальный месячный платёж процентного тарифа — из каталога, не константой:
    // владелец подтверждает в модалке КОНКРЕТНУЮ цифру. 0 — каталог ещё не загружен.
    minMonthly: data?.min_monthly ? data.min_monthly / 100 : 0,
    terms: data?.percent_rate
      ? { percent_rate: data.percent_rate, combo_rate: data.combo_rate, grace_days: data.grace_days }
      : TERMS_FALLBACK,
    // Ответ пришёл или окончательно не пришёл: ошибка каталога не держит страницу
    // в ожидании — цены тогда нулевые, как и раньше.
    catalogReady: status !== 'pending',
  };
}
