import type { PlanType, Feature } from './types';

// Цвет карточки тарифа — чисто UI, сервер каталога его не отдаёт (CLAUDE.md §8).
// Имена и цены живут на сервере: GET /billing/plans (см. useBillingCalculator).
export const PLAN_COLORS: Record<PlanType, string> = {
  start:    '#A3C9A8',
  pro:      '#FCAE91',
  business: '#1A1A1A',
};

// key — ключ i18n namespace billing (features.<plan>.<feature>), текст в locales/*/billing.json.
export const planFeatures: Record<PlanType, Feature[]> = {
  start: [
    { key: 'features.start.staff',      on: true  },
    { key: 'features.start.clients',     on: true  },
    { key: 'features.start.booking',     on: true  },
    { key: 'features.start.calendar',    on: true  },
    { key: 'features.start.analytics',   on: false },
    { key: 'features.start.api',         on: false },
    { key: 'features.start.loyalty',     on: false },
    { key: 'features.start.whiteLabel',  on: false },
  ],
  pro: [
    { key: 'features.pro.staff',      on: true  },
    { key: 'features.pro.clients',    on: true  },
    { key: 'features.pro.analytics',  on: true  },
    { key: 'features.pro.loyalty',    on: true  },
    { key: 'features.pro.telegram',   on: true  },
    { key: 'features.pro.support',    on: true  },
    { key: 'features.pro.api',        on: false },
    { key: 'features.pro.whiteLabel', on: false },
  ],
  business: [
    { key: 'features.business.unlimited',    on: true },
    { key: 'features.business.whiteLabel',   on: true },
    { key: 'features.business.api',          on: true },
    { key: 'features.business.multiBranch',  on: true },
    { key: 'features.business.manager',      on: true },
    { key: 'features.business.integrations', on: true },
    { key: 'features.business.sla',          on: true },
    { key: 'features.business.training',     on: true },
  ],
};
