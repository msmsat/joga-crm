import type { Tab, TrainerRecord, ServiceRecord, SalesRecord, Period } from './types';

export const TABS: Tab[] = ['overview', 'sales', 'clients', 'team', 'schedule'];

export const PERIOD_LABELS: Record<Period, string> = {
  day: 'День', week: 'Неделя', month: 'Месяц', year: 'Год',
};

export const TRAINER_DATA: TrainerRecord[] = [
  { name: 'Анна Смирнова',  role: 'Пилатес',  sessions: 87, revenue: 104000, rating: 4.9, retention: 94, color: '#FCAE91' },
  { name: 'Мария Козлова',  role: 'Йога',      sessions: 74, revenue: 88000,  rating: 4.8, retention: 91, color: '#5BAB72' },
  { name: 'Дмитрий Орлов',  role: 'Растяжка',  sessions: 62, revenue: 72000,  rating: 4.7, retention: 88, color: '#4A80C4' },
  { name: 'Ольга Новикова', role: 'Реформер',  sessions: 48, revenue: 59000,  rating: 4.6, retention: 85, color: '#A3C9A8' },
];

export const SERVICE_DATA: ServiceRecord[] = [
  { name: 'Групповой пилатес',    sessions: 148, revenue: 128000, share: 45, color: '#FCAE91', trend: '+12%' },
  { name: 'Индивидуальный урок',  sessions: 64,  revenue: 78000,  share: 27, color: '#5BAB72', trend: '+8%'  },
  { name: 'Реформер пилатес',     sessions: 51,  revenue: 54000,  share: 19, color: '#4A80C4', trend: '+21%' },
  { name: 'Растяжка / Стретчинг', sessions: 26,  revenue: 24000,  share: 9,  color: '#D88C9A', trend: '-3%'  },
];

export const DAILY_CHECKS = [1800, 2200, 1950, 2400, 2100, 1700, 2800];
export const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const SALES_DATA: SalesRecord[] = [
  {
    label: 'Абонемент 8 занятий', count: 42, revenue: 109000, avg: 2600, badge: 'ТОП',
    buyers: { newPct: 32, retPct: 68 },
    payments: [{ label: 'Карта онлайн', pct: 62, color: 'var(--accent)' }, { label: 'Наличные', pct: 25, color: '#5BAB72' }, { label: 'Перевод', pct: 13, color: '#4A80C4' }],
  },
  {
    label: 'Разовое занятие', count: 38, revenue: 45000, avg: 1200, badge: '',
    buyers: { newPct: 58, retPct: 42 },
    payments: [{ label: 'Карта онлайн', pct: 45, color: 'var(--accent)' }, { label: 'Наличные', pct: 40, color: '#5BAB72' }, { label: 'Перевод', pct: 15, color: '#4A80C4' }],
  },
  {
    label: 'Абонемент 16 занятий', count: 19, revenue: 83000, avg: 4400, badge: 'РОСТ',
    buyers: { newPct: 22, retPct: 78 },
    payments: [{ label: 'Карта онлайн', pct: 70, color: 'var(--accent)' }, { label: 'Наличные', pct: 18, color: '#5BAB72' }, { label: 'Перевод', pct: 12, color: '#4A80C4' }],
  },
  {
    label: 'Подарочный сертификат', count: 11, revenue: 28000, avg: 2500, badge: '',
    buyers: { newPct: 45, retPct: 55 },
    payments: [{ label: 'Карта онлайн', pct: 80, color: 'var(--accent)' }, { label: 'Наличные', pct: 14, color: '#5BAB72' }, { label: 'Перевод', pct: 6, color: '#4A80C4' }],
  },
  {
    label: 'Абонемент безлимит', count: 8, revenue: 52000, avg: 6500, badge: '',
    buyers: { newPct: 15, retPct: 85 },
    payments: [{ label: 'Карта онлайн', pct: 75, color: 'var(--accent)' }, { label: 'Наличные', pct: 15, color: '#5BAB72' }, { label: 'Перевод', pct: 10, color: '#4A80C4' }],
  },
  {
    label: 'Пробное занятие', count: 22, revenue: 11000, avg: 500, badge: 'НОВЫЙ',
    buyers: { newPct: 90, retPct: 10 },
    payments: [{ label: 'Карта онлайн', pct: 35, color: 'var(--accent)' }, { label: 'Наличные', pct: 55, color: '#5BAB72' }, { label: 'Перевод', pct: 10, color: '#4A80C4' }],
  },
];
