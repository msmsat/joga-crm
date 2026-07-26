import type { MetricPresenter } from './types';

export const METRIC_PRESENTERS: MetricPresenter[] = [
  { id: 'revenue',   title: 'Выручка за месяц',   color: '#FCAE91', glow: 'rgba(252,174,145,0.2)', route: '/dashboard/finances' },
  { id: 'clients',   title: 'Активных клиентов',  color: '#5BAB72', glow: 'rgba(91,171,114,0.2)',  route: '/dashboard/clients' },
  { id: 'bookings',  title: 'Записей за месяц',   color: '#4A80C4', glow: 'rgba(74,128,196,0.2)',  route: '/dashboard/booking' },
  { id: 'retention', title: 'Уровень удержания',  color: '#D88C9A', glow: 'rgba(216,140,154,0.2)', route: '/dashboard/reports' },
];

/** Палитра для баров сводок (услуги/тренеры). */
export const BAR_COLORS = ['#FCAE91', '#5BAB72', '#4A80C4', '#f0c040', '#D88C9A', '#7B6CD4'];
