import type { PlanType, Invoice, Feature } from './types';

export const plans: Record<PlanType, { name: string; monthly: number; color: string }> = {
  start:    { name: 'Старт',    monthly: 990,  color: '#A3C9A8' },
  pro:      { name: 'Pro',      monthly: 2490, color: '#FCAE91' },
  business: { name: 'Business', monthly: 5990, color: '#1A1A1A' },
};

export const periodDiscounts: Record<number, number> = { 1: 0, 6: 0.20, 12: 0.30, 24: 0.40 };

export const invoices: Invoice[] = [
  { id: 6, plan_name: 'Pro — июнь 2025',    amount: 2490, status: 'paid', payment_method: 'Visa •••• 4242', paid_at: '2025-06-01', pdf_url: null },
  { id: 5, plan_name: 'Pro — май 2025',     amount: 2490, status: 'paid', payment_method: 'Visa •••• 4242', paid_at: '2025-05-01', pdf_url: null },
  { id: 4, plan_name: 'Pro — апрель 2025',  amount: 2490, status: 'paid', payment_method: 'Visa •••• 4242', paid_at: '2025-04-01', pdf_url: null },
  { id: 3, plan_name: 'Pro — март 2025',    amount: 2490, status: 'paid', payment_method: 'Visa •••• 4242', paid_at: '2025-03-01', pdf_url: null },
  { id: 2, plan_name: 'Pro — февраль 2025', amount: 2490, status: 'paid', payment_method: 'Visa •••• 4242', paid_at: '2025-02-01', pdf_url: null },
  { id: 1, plan_name: 'Старт — январь 2025', amount: 990, status: 'paid', payment_method: 'Visa •••• 4242', paid_at: '2025-01-01', pdf_url: null },
];

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
