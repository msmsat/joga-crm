import { useEffect, useState } from 'react';
import type { BillingMode, BillingPlan, PlanType, PlanPeriod } from '../types';
import type { Plan } from '../../../../api/billing/billing.types';
import { DEFAULT_PLAN_ID } from '../constants';
import { planSeats } from '../../../../lib/plan';
import { getActiveContextKey } from '../../../../utils/auth';

// Режим тарифа в БД ↔ плитка в интерфейсе. Комбо на сервере зовётся "combo",
// а плитка исторически называется 'fixed' — без этой пары UI и БД молча
// расходятся, а цену подписки определяет именно БД (checkout._is_combo).
const MODE_FROM_SERVER: Record<string, BillingMode> = {
  subscription: 'subscription', percent: 'percent', combo: 'fixed',
};
const MODES: BillingMode[] = ['subscription', 'percent', 'fixed'];

// Выбор тарифа и периода — СВОЙ у каждой модели оплаты. Подписка и комбо это
// разные продукты: у комбо свой Price в Stripe и половинная цена, поэтому «Старт»,
// выбранный в комбо, ничего не говорит о выборе в подписке. Одно состояние на обе
// плитки молча переносило выбор между ними (жалоба 14.08.2026).
type Choice = { plan: PlanType; period: PlanPeriod };
const DEFAULT_CHOICE: Choice = { plan: DEFAULT_PLAN_ID, period: 1 };

/** Только то, что владелец выбрал САМ. Пустое поле — выбора не было, и страница
 *  стоит на том, что оплачено (а без подписки — на дефолте). */
interface SavedChoice {
  mode: BillingMode | null;
  choices: Partial<Record<BillingMode, Choice>>;
}
type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const storageKey = (scope: string) => `billing:choice:${scope}`;
const empty = (): SavedChoice => ({ mode: null, choices: {} });

export function readBillingChoice(scope: string, storage?: Pick<ChoiceStorage, 'getItem'>): SavedChoice {
  if (!scope) return empty();
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(storageKey(scope)) ?? 'null');
    const choices: SavedChoice['choices'] = {};
    for (const mode of MODES) {
      const item = value?.choices?.[mode];
      if (typeof item?.plan === 'string' && planSeats(item.plan) !== undefined
        && Number.isSafeInteger(item.period) && item.period > 0) {
        choices[mode] = { plan: item.plan, period: item.period };
      }
    }
    return { mode: MODES.includes(value?.mode) ? value.mode : null, choices };
  } catch { return empty(); }
}

export function writeBillingChoice(scope: string, value: SavedChoice, storage?: Pick<ChoiceStorage, 'setItem'>) {
  if (!scope) return;
  try { (storage ?? localStorage).setItem(storageKey(scope), JSON.stringify(value)); }
  catch { /* Хранилище недоступно (приватный режим) — выбор работает, просто не запомнится. */ }
}

/**
 * Модель оплаты, ступень и период. Выбор переживает уход со страницы: раньше
 * каждый заход открывался заново на «5 сотрудниках» и месяце. Хранится отдельно
 * на студию и пользователя (SessionRoute перемонтирует страницу при смене
 * аккаунта или студии, так что каждый контекст читает своё).
 *
 * Пока владелец ничего не выбирал, страница стоит на ОПЛАЧЕННОМ: плитка — на
 * модели из БД (иначе студия на комбо видела полную цену подписки), ползунок —
 * на её ступени, а не расходится с бейджем «Текущий».
 */
export function useBillingChoice(plan: BillingPlan | null, catalog: Plan[], periodDiscounts: Record<number, number>) {
  const [scope] = useState(getActiveContextKey);
  const [saved, setSaved] = useState(() => readBillingChoice(scope));
  useEffect(() => { writeBillingChoice(scope, saved); }, [scope, saved]);

  const paidMode = plan?.billing_mode ? MODE_FROM_SERVER[plan.billing_mode] : undefined;
  const billingMode = saved.mode ?? paidMode ?? 'subscription';

  // Оплаченную ступень подставляем ИМЕННО в оплаченную модель, а не в открытую
  // сейчас плитку: комбо «Старт» не делает «Старт» выбранным и в подписке.
  const paidChoice: Choice = paidMode === billingMode && plan?.status === 'active' && planSeats(plan.plan_name) !== undefined
    ? { plan: plan.plan_name, period: 1 }
    : DEFAULT_CHOICE;
  // Запомненное могло устареть: ступень ушла из каталога, период больше не продают.
  // Пока каталог не приехал, ступень проверить не по чему — верим сохранённой.
  const known = (item?: Choice): item is Choice => !!item
    && (catalog.length === 0 || catalog.some(p => p.id === item.plan))
    && item.period in periodDiscounts;
  const remembered = saved.choices[billingMode];
  const choice = known(remembered) ? remembered : paidChoice;

  const setChoice = (next: Partial<Choice>) =>
    setSaved(s => ({ ...s, choices: { ...s.choices, [billingMode]: { ...choice, ...next } } }));

  return {
    billingMode,
    setBillingMode: (mode: BillingMode) => setSaved(s => ({ ...s, mode })),
    selectedPlan: choice.plan,
    setSelectedPlan: (planId: PlanType) => setChoice({ plan: planId }),
    selectedPeriod: choice.period,
    setSelectedPeriod: (period: PlanPeriod) => setChoice({ period }),
  };
}
