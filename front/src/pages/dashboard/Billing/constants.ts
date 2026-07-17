import type { PlanType, Feature } from './types';

// Цвет карточки тарифа — чисто UI, сервер каталога его не отдаёт (CLAUDE.md §8).
// Имена и цены живут на сервере: GET /billing/plans (см. useBillingCalculator).
export const PLAN_COLORS: Record<PlanType, string> = {
  start:    '#A3C9A8',
  pro:      '#FCAE91',
  business: '#1A1A1A',
};

export const planFeatures: Record<PlanType, Feature[]> = {
  start: [
    { text: 'До 3 сотрудников',      on: true  },
    { text: 'До 100 клиентов',        on: true  },
    { text: 'Онлайн-запись',          on: true  },
    { text: 'Базовый календарь',      on: true  },
    { text: 'Аналитика',              on: false },
    { text: 'API-доступ',             on: false },
    { text: 'Лояльность и CRM',       on: false },
    { text: 'White-label',            on: false },
  ],
  pro: [
    { text: 'До 20 сотрудников',      on: true  },
    { text: 'Неограниченно клиентов', on: true  },
    { text: 'Полная аналитика',       on: true  },
    { text: 'Лояльность и CRM',       on: true  },
    { text: 'Telegram-уведомления',   on: true  },
    { text: 'Приоритетная поддержка', on: true  },
    { text: 'API-доступ',             on: false },
    { text: 'White-label',            on: false },
  ],
  business: [
    { text: 'Неограниченно всё',      on: true },
    { text: 'White-label',            on: true },
    { text: 'API-доступ',             on: true },
    { text: 'Мультифилиалы',          on: true },
    { text: 'Выделенный менеджер',    on: true },
    { text: 'Кастомные интеграции',   on: true },
    { text: 'SLA 99.9%',              on: true },
    { text: 'Обучение команды',       on: true },
  ],
};
