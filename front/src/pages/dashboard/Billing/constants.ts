import type { PlanType, Invoice, Feature } from './types';

export const plans: Record<PlanType, { name: string; monthly: number; color: string }> = {
  start:    { name: 'Старт',    monthly: 990,  color: '#A3C9A8' },
  pro:      { name: 'Pro',      monthly: 2490, color: '#FCAE91' },
  business: { name: 'Business', monthly: 5990, color: '#1A1A1A' },
};

export const periodDiscounts: Record<number, number> = { 1: 0, 6: 0.20, 12: 0.30, 24: 0.40 };

export const invoices: Invoice[] = [
  { date: '01.06.2025', amount: '₽2 490', status: 'paid', desc: 'Pro — июнь 2025' },
  { date: '01.05.2025', amount: '₽2 490', status: 'paid', desc: 'Pro — май 2025' },
  { date: '01.04.2025', amount: '₽2 490', status: 'paid', desc: 'Pro — апрель 2025' },
  { date: '01.03.2025', amount: '₽2 490', status: 'paid', desc: 'Pro — март 2025' },
  { date: '01.02.2025', amount: '₽2 490', status: 'paid', desc: 'Pro — февраль 2025' },
  { date: '01.01.2025', amount: '₽990',   status: 'paid', desc: 'Старт — январь 2025' },
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
