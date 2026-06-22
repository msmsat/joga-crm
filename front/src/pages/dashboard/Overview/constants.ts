import type { MetricConfig, RecentEvent } from './types';

export const METRICS: MetricConfig[] = [
  {
    id: 'revenue',
    title: 'Выручка за месяц',
    value: '₽284K',
    change: '↑ 18.4% vs прошлый мес.',
    color: '#FCAE91',
    glow: 'rgba(252,174,145,0.2)',
    route: '/dashboard/finances',
    formatTooltip: (v) => `₽${(v * 2.84).toFixed(0)}K`,
  },
  {
    id: 'clients',
    title: 'Активных клиентов',
    value: '142',
    change: '↑ 12 новых',
    color: '#5BAB72',
    glow: 'rgba(91,171,114,0.2)',
    route: '/dashboard/clients',
    formatTooltip: (v) => `${Math.floor(v * 1.42)} чел.`,
  },
  {
    id: 'bookings',
    title: 'Записей сегодня',
    value: '37',
    change: '↑ 5 vs вчера',
    color: '#4A80C4',
    glow: 'rgba(74,128,196,0.2)',
    route: '/dashboard/booking',
    formatTooltip: (v) => `${Math.floor(v * 0.45)} зап.`,
  },
  {
    id: 'retention',
    title: 'Уровень удержания',
    value: '87%',
    change: '↑ 3.2%',
    color: '#D88C9A',
    glow: 'rgba(216,140,154,0.2)',
    route: '/dashboard/reports',
    formatTooltip: (v) => `${Math.floor(v * 0.9)}%`,
  },
];

export const chartData = {
  week: {
    labels: ['12/5', '19/5', '26/5', '2/6', '9/6', '16/6', '23/6', '30/6'],
    revenue:   [68, 82, 74, 91, 78, 95, 88, 100],
    clients:   [80, 82, 85, 84, 88, 92, 95, 100],
    bookings:  [60, 75, 70, 85, 90, 80, 95, 100],
    retention: [80, 82, 81, 85, 87, 86, 88, 92],
  },
  month: {
    labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг'],
    revenue:   [45, 60, 55, 75, 65, 85, 70, 95],
    clients:   [60, 65, 70, 75, 80, 85, 90, 100],
    bookings:  [50, 55, 60, 70, 80, 75, 90, 95],
    retention: [75, 78, 80, 82, 85, 87, 89, 90],
  },
  year: {
    labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'],
    revenue:   [30, 45, 60, 50, 75, 85, 95, 100],
    clients:   [20, 35, 50, 65, 80, 90, 95, 100],
    bookings:  [30, 40, 55, 65, 75, 85, 95, 100],
    retention: [60, 65, 70, 75, 80, 85, 88, 92],
  },
};

export const RECENT_EVENTS: RecentEvent[] = [
  { id: 1,  type: 'booking', actor: 'Мария К.',        action: 'записалась на пилатес',     time: '2 мин. назад',  color: '#FCAE91' },
  { id: 2,  type: 'payment', actor: 'Оплата ₽3 500',   action: 'от Елены Соколовой',        time: '14 мин. назад', color: '#5BAB72' },
  { id: 3,  type: 'system',  actor: 'Дмитрий П.',      action: 'активировал абонемент',      time: '38 мин. назад', color: '#4A80C4' },
  { id: 4,  type: 'cancel',  actor: 'Отмена записи',   action: '— Наталья Б. (18:00)',       time: '1 час назад',   color: '#D88C9A' },
  { id: 5,  type: 'system',  actor: 'Новый VIP клиент',action: '— Алексей Морозов',          time: '2 часа назад',  color: '#f0c040' },
  { id: 6,  type: 'booking', actor: 'Анна С.',          action: 'записалась на стретчинг',    time: '3 ч назад',     color: '#FCAE91' },
  { id: 7,  type: 'payment', actor: 'Оплата ₽5 000',   action: 'от Ирины Власовой',          time: '4 ч назад',     color: '#5BAB72' },
  { id: 8,  type: 'cancel',  actor: 'Отмена записи',   action: '— Кирилл Н. (10:00)',        time: '5 ч назад',     color: '#D88C9A' },
  { id: 9,  type: 'system',  actor: 'Виктория Л.',      action: 'активировала безлимит',      time: '6 ч назад',     color: '#4A80C4' },
  { id: 10, type: 'booking', actor: 'Полина М.',        action: 'записалась на йогу',          time: '7 ч назад',     color: '#FCAE91' },
  { id: 11, type: 'payment', actor: 'Оплата ₽2 200',   action: 'от Максима Сидорова',        time: '8 ч назад',     color: '#5BAB72' },
  { id: 12, type: 'system',  actor: 'Новый клиент',     action: '— Светлана Козлова',         time: '9 ч назад',     color: '#f0c040' },
  { id: 13, type: 'cancel',  actor: 'Отмена записи',   action: '— Елена Г. (14:30)',         time: '10 ч назад',    color: '#D88C9A' },
];

export const svcs: [string, number, string][] = [
  ['Групповой пилатес',    78, '#FCAE91'],
  ['Индивид. тренировка', 52, '#5BAB72'],
  ['Йога',                 44, '#4A80C4'],
  ['Стретчинг',            38, '#f0c040'],
];

export const trainers: [string, string, number][] = [
  ['Анна Н.',    '#5BAB72', 94],
  ['Дарья П.',   '#e08060', 81],
  ['Михаил В.',  '#40a8a0', 68],
];

export const TASKS = [
  { id: 1, text: 'Позвонить клиентке Анне П. по вопросу продления', priority: 'high'   as const, tag: 'Клиент'   },
  { id: 2, text: 'Продлить абонемент #445 — Елена Соколова',        priority: 'high'   as const, tag: 'Финансы'  },
  { id: 3, text: 'Ответить на заявку из Instagram (3 новых)',        priority: 'medium' as const, tag: 'Лиды'     },
  { id: 4, text: 'Сформировать недельный отчёт по загрузке',        priority: 'medium' as const, tag: 'Отчёты'   },
  { id: 5, text: 'Обновить расписание на июль',                     priority: 'low'    as const, tag: 'Журнал'   },
  { id: 6, text: 'Написать Михаилу В. про замену в пятницу',        priority: 'low'    as const, tag: 'Персонал' },
];
