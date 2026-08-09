import type { PlanType } from './types';

// Цвет карточки тарифа — чисто UI, сервер каталога его не отдаёт (CLAUDE.md §8).
// Имена и цены живут на сервере: GET /billing/plans (см. useBillingCalculator).
export const PLAN_COLORS: Record<PlanType, string> = {
  start:    '#A3C9A8',
  pro:      '#FCAE91',
  business: '#1A1A1A',
};

// Лимит сотрудников — единственное, чем тарифы реально отличаются сегодня (остальные
// «фичи» ещё не гейтятся по плану). Источник истины — back/routers/billing/plans.py,
// эти значения лишь плейсхолдер на миг до первого ответа каталога (без скачка вёрстки).
export const PLAN_STAFF_FALLBACK: Record<PlanType, number | null> = {
  start: 3,
  pro: 15,
  business: null,
};
