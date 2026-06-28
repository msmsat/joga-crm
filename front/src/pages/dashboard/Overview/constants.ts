import type { MetricConfig, RecentEvent, Task } from './types';

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

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const RECENT_EVENTS: RecentEvent[] = [
  { id: 1,  event_type: 'booking', actor_name: 'Мария К.',        title: 'записалась на пилатес',     created_at: ago(2),    color: '#FCAE91', entity_type: null },
  { id: 2,  event_type: 'payment', actor_name: 'Оплата ₽3 500',   title: 'от Елены Соколовой',        created_at: ago(14),   color: '#5BAB72', entity_type: null },
  { id: 3,  event_type: 'system',  actor_name: 'Дмитрий П.',      title: 'активировал абонемент',      created_at: ago(38),   color: '#4A80C4', entity_type: null },
  { id: 4,  event_type: 'cancel',  actor_name: 'Отмена записи',   title: '— Наталья Б. (18:00)',       created_at: ago(60),   color: '#D88C9A', entity_type: null },
  { id: 5,  event_type: 'system',  actor_name: 'Новый VIP клиент',title: '— Алексей Морозов',          created_at: ago(120),  color: '#f0c040', entity_type: null },
  { id: 6,  event_type: 'booking', actor_name: 'Анна С.',         title: 'записалась на стретчинг',    created_at: ago(180),  color: '#FCAE91', entity_type: null },
  { id: 7,  event_type: 'payment', actor_name: 'Оплата ₽5 000',  title: 'от Ирины Власовой',          created_at: ago(240),  color: '#5BAB72', entity_type: null },
  { id: 8,  event_type: 'cancel',  actor_name: 'Отмена записи',   title: '— Кирилл Н. (10:00)',        created_at: ago(300),  color: '#D88C9A', entity_type: null },
  { id: 9,  event_type: 'system',  actor_name: 'Виктория Л.',     title: 'активировала безлимит',      created_at: ago(360),  color: '#4A80C4', entity_type: null },
  { id: 10, event_type: 'booking', actor_name: 'Полина М.',       title: 'записалась на йогу',         created_at: ago(420),  color: '#FCAE91', entity_type: null },
  { id: 11, event_type: 'payment', actor_name: 'Оплата ₽2 200',  title: 'от Максима Сидорова',        created_at: ago(480),  color: '#5BAB72', entity_type: null },
  { id: 12, event_type: 'system',  actor_name: 'Новый клиент',    title: '— Светлана Козлова',         created_at: ago(540),  color: '#f0c040', entity_type: null },
  { id: 13, event_type: 'cancel',  actor_name: 'Отмена записи',   title: '— Елена Г. (14:30)',         created_at: ago(600),  color: '#D88C9A', entity_type: null },
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

export const TASKS: Task[] = [
  { id: 1, text: 'Позвонить клиентке Анне П. по вопросу продления', priority: 'high',   tag: 'Клиент',   is_done: false, done_at: null, created_at: ago(1440) },
  { id: 2, text: 'Продлить абонемент #445 — Елена Соколова',        priority: 'high',   tag: 'Финансы',  is_done: false, done_at: null, created_at: ago(1380) },
  { id: 3, text: 'Ответить на заявку из Instagram (3 новых)',        priority: 'medium', tag: 'Лиды',     is_done: false, done_at: null, created_at: ago(1320) },
  { id: 4, text: 'Сформировать недельный отчёт по загрузке',        priority: 'medium', tag: 'Отчёты',   is_done: false, done_at: null, created_at: ago(1260) },
  { id: 5, text: 'Обновить расписание на июль',                     priority: 'low',    tag: 'Журнал',   is_done: false, done_at: null, created_at: ago(1200) },
  { id: 6, text: 'Написать Михаилу В. про замену в пятницу',        priority: 'low',    tag: 'Персонал', is_done: false, done_at: null, created_at: ago(1140) },
];
