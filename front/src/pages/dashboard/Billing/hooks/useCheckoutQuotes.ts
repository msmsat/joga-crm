import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillingPlan, CheckoutQuote, CheckoutQuotes } from '../../../../api/billing/billing.types';
import { billingApi } from '../../../../api/billing/billing.api';
import { queryKeys } from '../../../../api/queryKeys';

const index = (data?: CheckoutQuotes) =>
  data ? new Map(data.quotes.map(quote => [`${quote.plan}:${quote.period_months}`, quote])) : null;

/**
 * Расчёты покупки: итог с налогом, вид перехода, даты доступа — для КАЖДОЙ
 * ступени и периода, по набору на модель (GET /billing/checkout/quotes).
 *
 * Раньше страница спрашивала сервер на каждый выбор, и до ответа панель
 * показывала сумму без налога и без его строки, а с ответом — с налогом: цифры
 * менялись дважды, панель вырастала, и вся карточка дёргалась. Теперь смена
 * места или периода — поиск в готовом наборе, одна перерисовка. Своей налоговой
 * арифметики здесь по-прежнему нет: суммы считает сервер тем же `_quote`, что и
 * одиночный расчёт.
 *
 * Набор комбо берём сразу вместе с подпиской, чтобы и переключение плитки
 * модели не ждало сервера.
 */
export function useCheckoutQuotes(plan: BillingPlan | null) {
  const qc = useQueryClient();
  const subscription = useQuery({
    queryKey: queryKeys.billingQuotes(false),
    queryFn: () => billingApi.getCheckoutQuotes(false),
  });
  const combo = useQuery({
    queryKey: queryKeys.billingQuotes(true),
    queryFn: () => billingApi.getCheckoutQuotes(true),
  });
  const plainIndex = useMemo(() => index(subscription.data), [subscription.data]);
  const comboIndex = useMemo(() => index(combo.data), [combo.data]);

  // Вид перехода и даты доступа зависят от того, что студия уже оплатила. План
  // сменился (оплата, смена модели, сверка счёта) — набор пересчитывается.
  // Первую загрузку плана не считаем: набор и так запрошен с тем же состоянием.
  const signature = plan
    ? [plan.plan_name, plan.billing_mode, plan.status, plan.expires_at, plan.has_live_subscription, plan.first_payment_promo_available].join('|')
    : null;
  const seen = useRef(signature);
  useEffect(() => {
    if (seen.current === signature) return;
    if (seen.current !== null) qc.invalidateQueries({ queryKey: queryKeys.billingQuotesAll });
    seen.current = signature;
  }, [signature, qc]);

  return {
    quoteFor: (isCombo: boolean, planId: string, period: number): CheckoutQuote | null =>
      (isCombo ? comboIndex : plainIndex)?.get(`${planId}:${period}`) ?? null,
    // Ответ пришёл или окончательно не пришёл. Ошибка не держит страницу в
    // ожидании: панель тогда показывает сумму каталога без налога, как раньше.
    quotesReady: (isCombo: boolean) => (isCombo ? combo : subscription).status !== 'pending',
  };
}
