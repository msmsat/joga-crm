import type { Studio, Service } from './types';

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function makeHours(open: string, close: string, closedDays: number[] = []) {
  return DAYS_SHORT.map((day_short, day_index) => ({
    day_index,
    day_short,
    is_open: !closedDays.includes(day_index),
    open_time: open,
    close_time: close,
  }));
}

export const MOCK_STUDIOS: Studio[] = [
  {
    id: 1,
    name: 'Velora Арбат',
    country: 'Россия',
    city: 'Москва',
    street: 'ул. Арбат, 15',
    phone: '+7 495 123-45-67',
    email: 'arbat@velora.studio',
    working_hours: makeHours('08:00', '22:00', [6]),
    halls: [
      { id: 1, name: 'Зал А', capacity: 15, area: 45, color: '#5BAB72', equipment: ['Коврики', 'Блоки', 'Ремни', 'Болстеры'], price_per_hour: 3000 },
      { id: 2, name: 'Зал Б', capacity: 8, area: 28, color: '#4A80C4', equipment: ['Пилатес-реформер', 'Коврики', 'Мячи'], price_per_hour: 4500 },
      { id: 3, name: 'Студия С', capacity: 4, area: 18, color: '#FCAE91', equipment: ['TRX', 'Гантели'], price_per_hour: 6000 },
    ],
  },
  {
    id: 2,
    name: 'Velora Сити',
    country: 'Россия',
    city: 'Москва',
    street: 'Пресненская наб., 8с1',
    phone: '+7 495 987-65-43',
    email: 'city@velora.studio',
    working_hours: makeHours('07:00', '23:00', []),
    halls: [
      { id: 4, name: 'Зал 1', capacity: 20, area: 60, color: '#9B59B6', equipment: ['Коврики', 'Блоки', 'Ремни'], price_per_hour: 3500 },
      { id: 5, name: 'Зал 2', capacity: 6, area: 24, color: '#E67E22', equipment: ['TRX', 'Гантели', 'Коврики'], price_per_hour: 5000 },
    ],
  },
  {
    id: 3,
    name: 'Velora Невский',
    country: 'Россия',
    city: 'Санкт-Петербург',
    street: 'Невский пр., 78',
    phone: '+7 812 246-81-01',
    email: 'nevsky@velora.studio',
    working_hours: makeHours('09:00', '21:00', [5, 6]),
    halls: [
      { id: 6, name: 'Студия 1', capacity: 12, area: 38, color: '#E74C3C', equipment: ['Коврики', 'Болстеры', 'Блоки'], price_per_hour: 2800 },
    ],
  },
];

export const SERVICE_CATEGORIES = ['Йога', 'Пилатес', 'Стретчинг', 'Индивидуальные'];

export const SCH_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '15:00', '17:00', '19:00', '20:00'];

function makeSchedule(slots: [number, number][]) {
  const matrix = Array.from({ length: SCH_TIMES.length }, () => Array(7).fill(0));
  for (const [ti, di] of slots) matrix[ti][di] = 1;
  return matrix;
}

export const MOCK_SERVICES: Service[] = [
  {
    id: 1, name: 'Хатха-йога', category: 'Йога', type: 'group',
    duration_min: 60, price: 1200, color: '#5BAB72',
    description: 'Классические асаны с акцентом на выравнивание и дыхание. Подходит для всех уровней подготовки.',
    max_clients: 15, bookings_total: 248, revenue_total: 297600,
    schedule: makeSchedule([[0,0],[0,2],[0,4],[2,1],[2,3],[4,0],[4,2],[4,4],[6,1],[6,5]]),
  },
  {
    id: 2, name: 'Виньяса-флоу', category: 'Йога', type: 'group',
    duration_min: 75, price: 1400, color: '#5BAB72',
    description: 'Динамичная практика с плавными переходами между позами в такт дыханию.',
    max_clients: 12, bookings_total: 186, revenue_total: 260400,
    schedule: makeSchedule([[1,1],[1,3],[3,0],[3,2],[5,1],[5,4],[7,2],[7,5]]),
  },
  {
    id: 3, name: 'Йога для начинающих', category: 'Йога', type: 'group',
    duration_min: 60, price: 1000, color: '#5BAB72',
    description: 'Базовые асаны и пранаямы для новичков в безопасном темпе без нагрузки.',
    max_clients: 10, bookings_total: 312, revenue_total: 312000,
    schedule: makeSchedule([[2,0],[2,2],[2,4],[4,1],[4,3],[6,0],[6,3]]),
  },
  {
    id: 4, name: 'Пилатес', category: 'Пилатес', type: 'group',
    duration_min: 55, price: 1300, color: '#4A80C4',
    description: 'Работа с глубокими мышцами корпуса, укрепление осанки и развитие баланса.',
    max_clients: 8, bookings_total: 142, revenue_total: 184600,
    schedule: makeSchedule([[1,0],[1,2],[3,1],[3,3],[5,0],[5,2],[5,4],[7,1],[7,4]]),
  },
  {
    id: 5, name: 'Пилатес на реформере', category: 'Пилатес', type: 'individual',
    duration_min: 50, price: 3500, color: '#4A80C4',
    description: 'Занятие на профессиональном пилатес-реформере. Программа подбирается индивидуально.',
    bookings_total: 68, revenue_total: 238000,
    schedule: makeSchedule([[2,1],[2,3],[4,0],[4,2],[4,4],[6,1],[6,3]]),
  },
  {
    id: 6, name: 'Стретчинг', category: 'Стретчинг', type: 'group',
    duration_min: 45, price: 900, color: '#FCAE91',
    description: 'Глубокое растяжение всех групп мышц и работа над гибкостью тела.',
    max_clients: 15, bookings_total: 204, revenue_total: 183600,
    schedule: makeSchedule([[0,1],[0,3],[2,0],[2,4],[4,1],[6,2],[6,4],[7,0],[7,3]]),
  },
  {
    id: 7, name: 'Индивидуальная йога', category: 'Индивидуальные', type: 'individual',
    duration_min: 60, price: 4000, color: '#9B59B6',
    description: 'Персональное занятие по йоге с учётом ваших целей, физических особенностей и уровня.',
    bookings_total: 44, revenue_total: 176000,
    schedule: makeSchedule([[3,0],[3,2],[5,1],[5,3],[7,0],[7,2],[7,4]]),
  },
  {
    id: 8, name: 'Персональный тренинг', category: 'Индивидуальные', type: 'individual',
    duration_min: 60, price: 5000, color: '#9B59B6',
    description: 'Индивидуальная тренировка с персональным тренером под ваши цели.',
    bookings_total: 31, revenue_total: 155000,
    schedule: makeSchedule([[2,1],[4,0],[4,3],[6,1],[6,4],[8,2],[8,5]]),
  },
];
