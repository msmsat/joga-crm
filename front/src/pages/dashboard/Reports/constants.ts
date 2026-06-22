import type { Tab, TrainerRecord, ServiceRecord, SalesRecord, EventRecord, Period } from './types';

export const TABS: Tab[] = ['Основные', 'По продажам', 'По тренерам', 'По услугам', 'Все', 'События'];

export const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл'];

export const MONTH_VALS: Record<Period, number[]> = {
  day:   [18, 21, 24, 19, 27, 26, 28],
  week:  [95, 110, 128, 103, 145, 138, 151],
  month: [180, 210, 240, 195, 270, 260, 284],
  year:  [1800, 2100, 2400, 1950, 2700, 2600, 2840],
};

export const PERIOD_LABELS: Record<Period, string> = {
  day: 'День', week: 'Неделя', month: 'Месяц', year: 'Год',
};

export const TRAINER_DATA: TrainerRecord[] = [
  { name: 'Анна Смирнова',   role: 'Пилатес',   sessions: 87, revenue: '₽104K', rating: 4.9, retention: 94, color: '#FCAE91', initials: 'АС' },
  { name: 'Мария Козлова',   role: 'Йога',       sessions: 74, revenue: '₽88K',  rating: 4.8, retention: 91, color: '#5BAB72', initials: 'МК' },
  { name: 'Дмитрий Орлов',   role: 'Растяжка',   sessions: 62, revenue: '₽72K',  rating: 4.7, retention: 88, color: '#4A80C4', initials: 'ДО' },
  { name: 'Ольга Новикова',  role: 'Реформер',   sessions: 48, revenue: '₽59K',  rating: 4.6, retention: 85, color: '#A3C9A8', initials: 'ОН' },
];

export const SERVICE_DATA: ServiceRecord[] = [
  { name: 'Групповой пилатес',        sessions: 148, revenue: '₽128K', share: 45, color: '#FCAE91', trend: '+12%' },
  { name: 'Индивидуальный урок',       sessions: 64,  revenue: '₽78K',  share: 27, color: '#5BAB72', trend: '+8%'  },
  { name: 'Реформер пилатес',          sessions: 51,  revenue: '₽54K',  share: 19, color: '#4A80C4', trend: '+21%' },
  { name: 'Растяжка / Стретчинг',      sessions: 26,  revenue: '₽24K',  share: 9,  color: '#D88C9A', trend: '-3%'  },
];

export const SALES_DATA: SalesRecord[] = [
  { label: 'Абонемент 8 занятий',    count: 42, revenue: '₽109K', avg: '₽2 600', badge: 'ТОП'  },
  { label: 'Разовое занятие',         count: 38, revenue: '₽45K',  avg: '₽1 200', badge: ''     },
  { label: 'Абонемент 16 занятий',   count: 19, revenue: '₽83K',  avg: '₽4 400', badge: 'РОСТ' },
  { label: 'Подарочный сертификат',   count: 11, revenue: '₽28K',  avg: '₽2 500', badge: ''     },
  { label: 'Абонемент безлимит',      count: 8,  revenue: '₽52K',  avg: '₽6 500', badge: ''     },
  { label: 'Пробное занятие',         count: 22, revenue: '₽11K',  avg: '₽500',   badge: 'НОВЫЙ'},
];

export const EVENTS_DATA: EventRecord[] = [
  { date: '15 июл', title: 'Мастер-класс по реформеру', type: 'Мероприятие', attendees: 14, revenue: '₽21K', status: 'Завершено', color: '#5BAB72' },
  { date: '22 июл', title: 'Воркшоп: Основы пилатеса',  type: 'Обучение',    attendees: 8,  revenue: '₽12K', status: 'Завершено', color: '#4A80C4' },
  { date: '28 июл', title: 'День открытых дверей',       type: 'Промо',       attendees: 31, revenue: '₽0',   status: 'Завершено', color: '#FCAE91' },
  { date: '5 авг',  title: 'Интенсив по растяжке',       type: 'Мероприятие', attendees: 12, revenue: '₽18K', status: 'Предстоит', color: '#D88C9A' },
  { date: '19 авг', title: 'Сезонный марафон',           type: 'Мероприятие', attendees: 0,  revenue: '—',    status: 'Предстоит', color: '#FCAE91' },
];
