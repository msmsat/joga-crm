import type { ClientData, EventRecord, BonusOption } from './types';

export const CATEGORIES = [
  'Все (142)',
  'VIP (18)',
  'Активные (89)',
  'Новые (12)',
  'С абонементом (67)',
  'Неактивные (23)',
  'День рождения (3)',
];

export const clientsData: ClientData[] = [
  {
    id: 1, name: 'Мария', last_name: 'Коваленко', avatar_color: '#E8825A',
    status: 'Активный', visit_count: 24, total_spent: 48000,
    active_subscription: { used: 7, total: 10, expires_at: '2025-08-01', type: 'Групповой' },
    phone: '+7 916 234-56-78', email: 'maria.kovalenko@gmail.com',
    birth_date: '14 марта 1992', city: 'Москва',
    registration_date: '12 янв 2024', last_visit_date: '3 июня 2025',
    loyalty_points: 2880,
    notes: [{ id: 1, text: 'Предпочитает утренние занятия. Аллергия на латекс.', created_at: '12.01.2024', updated_at: null }],
    tags: ['Пилатес', 'Йога'],
  },
  {
    id: 2, name: 'Алексей', last_name: 'Морозов', avatar_color: '#5BAA8C',
    status: 'VIP', visit_count: 86, total_spent: 180000,
    active_subscription: { used: 10, total: 10, expires_at: '2025-07-15', type: 'Персональный' },
    phone: '+7 905 123-45-67', email: 'a.morozov@corp.ru',
    birth_date: '7 июля 1985', city: 'Москва',
    registration_date: '3 фев 2023', last_visit_date: '4 июня 2025',
    loyalty_points: 10320,
    notes: [{ id: 1, text: 'Индивидуальный тренер — Ольга. Персональные занятия 2 раза в неделю.', created_at: '03.02.2023', updated_at: null }],
    tags: ['Персональный', 'Сила', 'VIP'],
  },
  {
    id: 3, name: 'Елена', last_name: 'Соколова', avatar_color: '#C4975A',
    status: 'Новый', visit_count: 2, total_spent: 4000,
    active_subscription: { used: 1, total: 8, expires_at: '2025-07-28', type: 'Групповой' },
    phone: '+7 977 890-12-34', email: 'e.sokolova@yandex.ru',
    birth_date: '22 ноября 1998', city: 'Подмосковье',
    registration_date: '28 мая 2025', last_visit_date: '1 июня 2025',
    loyalty_points: 240,
    notes: [{ id: 1, text: 'Пришла по рекомендации Марии Коваленко.', created_at: '28.05.2025', updated_at: null }],
    tags: ['Новичок', 'Пилатес'],
  },
  {
    id: 4, name: 'Дмитрий', last_name: 'Попов', avatar_color: '#6B8CC4',
    status: 'Активный', visit_count: 18, total_spent: 32000,
    active_subscription: { used: 5, total: 10, expires_at: '2025-08-10', type: 'Групповой' },
    phone: '+7 926 567-89-01', email: 'd.popov@mail.ru',
    birth_date: '3 апреля 1990', city: 'Москва',
    registration_date: '15 сен 2024', last_visit_date: '2 июня 2025',
    loyalty_points: 2160,
    notes: [{ id: 1, text: 'Реабилитация после травмы колена. Запрет: прыжки, бег.', created_at: '15.09.2024', updated_at: null }],
    tags: ['Реабилитация', 'Растяжка'],
  },
  {
    id: 5, name: 'Наталья', last_name: 'Белова', avatar_color: '#C47888',
    status: 'Активный', visit_count: 11, total_spent: 22000,
    active_subscription: { used: 3, total: 8, expires_at: '2025-07-20', type: 'Групповой' },
    phone: '+7 903 456-78-90', email: 'nbelova@inbox.ru',
    birth_date: '19 июня 1995', city: 'Москва',
    registration_date: '7 ноя 2024', last_visit_date: '30 мая 2025',
    loyalty_points: 1320,
    notes: [{ id: 1, text: 'День рождения скоро! Напомнить про поздравление.', created_at: '07.11.2024', updated_at: null }],
    tags: ['Йога', 'Медитация'],
  },
  {
    id: 6, name: 'Светлана', last_name: 'Иванова', avatar_color: '#8878B8',
    status: 'VIP', visit_count: 54, total_spent: 96000,
    active_subscription: { used: 8, total: 10, expires_at: '2025-08-05', type: 'VIP' },
    phone: '+7 985 321-65-43', email: 's.ivanova@corp.com',
    birth_date: '11 февраля 1988', city: 'Москва',
    registration_date: '20 мар 2023', last_visit_date: '4 июня 2025',
    loyalty_points: 6480,
    notes: [{ id: 1, text: 'Всегда записывается заранее. Очень пунктуальна.', created_at: '20.03.2023', updated_at: null }],
    tags: ['Пилатес', 'VIP', 'Постоянная'],
  },
];

export const STATUSES = ['Активный', 'VIP', 'Новый', 'Неактивный', 'Заморожен'];

export const STATUS_COLORS: Record<string, string> = {
  'Активный':   '#5BAB72',
  'VIP':        '#c8a84b',
  'Новый':      '#4A80C4',
  'Неактивный': '#999',
  'Заморожен':  '#7b6cd4',
};

export const EVENTS_HISTORY: EventRecord[] = [
  { date: '4 июня',  type: 'visit',   title: 'Утренний пилатес',              trainer: 'Ольга С.',   paid: '₽1 200' },
  { date: '3 июня',  type: 'payment', title: 'Покупка абонемента 10 занятий',                         amount: '₽12 000' },
  { date: '2 июня',  type: 'visit',   title: 'Стретчинг',                     trainer: 'Анна Р.',    paid: '₽900' },
  { date: '31 мая',  type: 'visit',   title: 'Йога-флоу',                     trainer: 'Ольга С.',   paid: '₽1 200' },
  { date: '28 мая',  type: 'visit',   title: 'Утренний пилатес',              trainer: 'Ольга С.',   paid: 'Абон.' },
  { date: '20 мая',  type: 'freeze',  title: 'Заморозка абонемента',                                  amount: '14 дней' },
  { date: '25 мая',  type: 'visit',   title: 'Персональная',                  trainer: 'Дмитрий К.', paid: '₽3 500' },
  { date: '15 мая',  type: 'payment', title: 'Продление абонемента',                                  amount: '₽8 000' },
];

export const EVENT_FILTER_TABS = ['Все', 'Оплаты', 'Посещения', 'Заморозки'] as const;

export const SUGGESTED_TAGS = ['Пробное', 'VIP', 'Рекомендация', 'Онлайн', 'Групповой', 'Персональный'];

export const BONUS_OPTIONS: BonusOption[] = [
  { id: 'points',   label: '+500 баллов',             description: 'Начислить на баланс лояльности' },
  { id: 'discount', label: 'Скидка 10% на продление', description: 'На следующую покупку абонемента' },
  { id: 'gift',     label: 'Подарочное занятие',       description: 'Бесплатное дополнительное занятие' },
];

export const VISITS_HISTORY = EVENTS_HISTORY;

export const SERVICES = [
  'Йога (60 мин)',
  'Пилатес (45 мин)',
  'Растяжка (60 мин)',
  'Медитация (30 мин)',
];
