import type { ClientData, VisitRecord } from './types';

export const CATEGORIES = [
  'Все (142)',
  'VIP (18)',
  'Активные (89)',
  'Новые (12)',
  'С абонементом (67)',
  'Неактивные (23)',
  'День рождения 🎂 (3)',
];

export const clientsData: ClientData[] = [
  { id: 1, n: 'Мария Коваленко',  i: 'МК', c: '#FCAE91', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 24, spent: '₽48K',  ab: 7,  abMax: 10, phone: '+7 916 234-56-78', email: 'maria.kovalenko@gmail.com', bday: '14 марта 1992',   city: 'Москва',      reg: '12 янв 2024', lastVisit: '3 июня 2025',  points: 2880,  note: 'Предпочитает утренние занятия. Аллергия на латекс.',                             tags: ['Пилатес', 'Йога'] },
  { id: 2, n: 'Алексей Морозов',  i: 'АМ', c: '#f0c040', type: 'vip',           badge: 'badge-vip',    bl: 'VIP',      v: 86, spent: '₽180K', ab: 10, abMax: 10, phone: '+7 905 123-45-67', email: 'a.morozov@corp.ru',          bday: '7 июля 1985',    city: 'Москва',      reg: '3 фев 2023',  lastVisit: '4 июня 2025',  points: 10320, note: 'Индивидуальный тренер — Ольга. Персональные занятия 2 раза в неделю.',    tags: ['Персональный', 'Сила', 'VIP'] },
  { id: 3, n: 'Елена Соколова',   i: 'ЕС', c: '#5BAB72', type: 'new-client',    badge: 'badge-new',    bl: 'Новый',    v: 2,  spent: '₽4K',   ab: 1,  abMax: 8,  phone: '+7 977 890-12-34', email: 'e.sokolova@yandex.ru',       bday: '22 ноября 1998', city: 'Подмосковье', reg: '28 мая 2025', lastVisit: '1 июня 2025',  points: 240,   note: 'Пришла по рекомендации Марии Коваленко.',                               tags: ['Новичок', 'Пилатес'] },
  { id: 4, n: 'Дмитрий Попов',    i: 'ДП', c: '#4A80C4', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 18, spent: '₽32K',  ab: 5,  abMax: 10, phone: '+7 926 567-89-01', email: 'd.popov@mail.ru',            bday: '3 апреля 1990',  city: 'Москва',      reg: '15 сен 2024', lastVisit: '2 июня 2025',  points: 2160,  note: 'Реабилитация после травмы колена. Запрет: прыжки, бег.',                tags: ['Реабилитация', 'Растяжка'] },
  { id: 5, n: 'Наталья Белова',   i: 'НБ', c: '#7b6cd4', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 11, spent: '₽22K',  ab: 3,  abMax: 8,  phone: '+7 903 456-78-90', email: 'nbelova@inbox.ru',           bday: '19 июня 1995',   city: 'Москва',      reg: '7 ноя 2024',  lastVisit: '30 мая 2025',  points: 1320,  note: 'День рождения скоро! Напомнить про поздравление.',                     tags: ['Йога', 'Медитация'] },
  { id: 6, n: 'Светлана Иванова', i: 'СИ', c: '#D88C9A', type: 'vip',           badge: 'badge-vip',    bl: 'VIP',      v: 54, spent: '₽96K',  ab: 8,  abMax: 10, phone: '+7 985 321-65-43', email: 's.ivanova@corp.com',         bday: '11 февраля 1988',city: 'Москва',      reg: '20 мар 2023', lastVisit: '4 июня 2025',  points: 6480,  note: 'Всегда записывается заранее. Очень пунктуальна.',                      tags: ['Пилатес', 'VIP', 'Постоянная'] },
];

export const STATUSES = ['Активный', 'VIP', 'Новый', 'Неактивный', 'Заморожен'];

export const STATUS_COLORS: Record<string, string> = {
  'Активный':   '#5BAB72',
  'VIP':        '#f0c040',
  'Новый':      '#4A80C4',
  'Неактивный': '#999',
  'Заморожен':  '#7b6cd4',
};

export const VISITS_HISTORY: VisitRecord[] = [
  { date: '4 июня',  name: 'Утренний пилатес', trainer: 'Ольга С.',    paid: '₽1 200' },
  { date: '2 июня',  name: 'Стретчинг',         trainer: 'Анна Р.',     paid: '₽900'   },
  { date: '31 мая',  name: 'Йога-флоу',          trainer: 'Ольга С.',    paid: '₽1 200' },
  { date: '28 мая',  name: 'Утренний пилатес',   trainer: 'Ольга С.',    paid: 'Абон.'  },
  { date: '25 мая',  name: 'Персональная',        trainer: 'Дмитрий К.',  paid: '₽3 500' },
];
