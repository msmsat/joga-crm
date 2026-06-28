// constants.ts

// Импортируем типы, так как они нужны для типизации констант
import type { Booking, ClientListItem } from './types';

export const TRAINERS = [
  { id: 0, name: 'Анна Н.', full: 'Анна Новикова', role: 'Пилатес', color: '#F9A08B', bg: 'rgba(249,160,139,0.12)', initials: 'АН' },
  { id: 1, name: 'Дарья П.', full: 'Дарья Петрова', role: 'Йога', color: '#5BAB72', bg: 'rgba(91,171,114,0.12)', initials: 'ДП' },
  { id: 2, name: 'Михаил В.', full: 'Михаил Волков', role: 'Стретчинг', color: '#40a8a0', bg: 'rgba(64,168,160,0.12)', initials: 'МВ' },
  { id: 3, name: 'Ольга С.', full: 'Ольга Смирнова', role: 'Фитнес', color: '#4A80C4', bg: 'rgba(74,128,196,0.12)', initials: 'ОС' },
  { id: 4, name: 'Иван К.', full: 'Иван Козлов', role: 'Кросс', color: '#7B6CD4', bg: 'rgba(123,108,212,0.12)', initials: 'ИК' },
];

export const HALLS = ['Зал 1', 'Зал 2', 'Студия', 'Онлайн'];
export const TIMES = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

// В файле src/constants.ts найдите массив BOOKINGS и замените его на этот:
export const BOOKINGS: Booking[] = [
  { id:1,  trainer:0, timeStart:2,  timeEnd:3,  title:'Пилатес',       hall:'Зал 1',  clients:6,  maxClients:8,  color:'#F9A08B', status:'confirmed', date:'2026-06-18' },
  { id:2,  trainer:0, timeStart:4,  timeEnd:5,  title:'Пил. Advanced', hall:'Зал 1',  clients:4,  maxClients:6,  color:'#F9A08B', status:'confirmed', date:'2026-06-19' },
  { id:3,  trainer:0, timeStart:8,  timeEnd:9,  title:'Персональный',  hall:'Студия', clients:1,  maxClients:1,  color:'#F9A08B', status:'confirmed', date:'2026-06-20' },
  { id:4,  trainer:0, timeStart:12, timeEnd:13, title:'Вечерний',       hall:'Зал 1',  clients:7,  maxClients:8,  color:'#F9A08B', status:'pending',   date:'2026-06-21' },
  { id:5,  trainer:1, timeStart:1,  timeEnd:2,  title:'Йога Хатха',    hall:'Зал 2',  clients:10, maxClients:12, color:'#5BAB72', status:'confirmed', date:'2026-06-16' },
  { id:6,  trainer:1, timeStart:5,  timeEnd:6,  title:'Флоу',           hall:'Зал 2',  clients:8,  maxClients:12, color:'#5BAB72', status:'confirmed', date:'2026-06-17' },
  { id:7,  trainer:1, timeStart:10, timeEnd:11, title:'Аштанга',        hall:'Зал 2',  clients:5,  maxClients:10, color:'#5BAB72', status:'confirmed', date:'2026-06-20' },
  { id:8,  trainer:2, timeStart:3,  timeEnd:4,  title:'Стретчинг',      hall:'Студия', clients:3,  maxClients:4,  color:'#40a8a0', status:'confirmed', date:'2026-06-15' },
  { id:9,  trainer:2, timeStart:7,  timeEnd:8,  title:'Стретч+',        hall:'Студия', clients:4,  maxClients:4,  color:'#40a8a0', status:'confirmed', date:'2026-06-19' },
  { id:10, trainer:2, timeStart:11, timeEnd:12, title:'Вечерний',       hall:'Зал 1',  clients:6,  maxClients:8,  color:'#40a8a0', status:'pending',   date:'2026-06-21' },
  { id:11, trainer:3, timeStart:0,  timeEnd:1,  title:'Открытие',       hall:'Зал 1',  clients:0,  maxClients:0,  color:'#4A80C4', status:'confirmed', date:'2026-06-18' },
  { id:12, trainer:3, timeStart:9,  timeEnd:10, title:'Планёрка',       hall:'Онлайн', clients:5,  maxClients:10, color:'#4A80C4', status:'confirmed', date:'2026-06-20' },
  { id:13, trainer:4, timeStart:2,  timeEnd:3,  title:'Фитбол',         hall:'Зал 2',  clients:9,  maxClients:12, color:'#7B6CD4', status:'confirmed', date:'2026-06-17' },
  { id:14, trainer:4, timeStart:8,  timeEnd:9,  title:'Роллинг',        hall:'Зал 1',  clients:5,  maxClients:8,  color:'#7B6CD4', status:'confirmed', date:'2026-06-21' },
  { id:15, trainer:4, timeStart:13, timeEnd:14, title:'Кросс-тренинг',  hall:'Зал 2',  clients:7,  maxClients:10, color:'#7B6CD4', status:'pending',   date:'2026-06-20' },
  { id:16, trainer:0, timeStart:9,  timeEnd:10, title:'Пилатес Утро',   hall:'Зал 1',  clients:5,  maxClients:8,  color:'#F9A08B', status:'confirmed', date:'2026-06-15' },
  { id:17, trainer:1, timeStart:13, timeEnd:14, title:'Йога Релакс',    hall:'Зал 2',  clients:8,  maxClients:12, color:'#5BAB72', status:'confirmed', date:'2026-06-16' },
  { id:18, trainer:4, timeStart:6,  timeEnd:7,  title:'Кроссфит',       hall:'Зал 1',  clients:10, maxClients:10, color:'#7B6CD4', status:'confirmed', date:'2026-06-19' },
  { id:19, trainer:3, timeStart:4,  timeEnd:5,  title:'Функционал',     hall:'Зал 2',  clients:6,  maxClients:12, color:'#4A80C4', status:'confirmed', date:'2026-06-21' },
];

export const CLIENTS_DB: ClientListItem[] = [
  { id:1, name:'Мария',     last_name:'Соколова',  phone:'+7 900 123-45-67', email:null, avatar_color:'#FCAE91', status:'active', tags:[], visit_count:24, total_spent:0, active_subscription:null, loyalty_points:0, last_visit_date:null, registration_date:null },
  { id:2, name:'Алина',     last_name:'Крылова',   phone:'+7 901 234-56-78', email:null, avatar_color:'#A3C9A8', status:'active', tags:[], visit_count:12, total_spent:0, active_subscription:null, loyalty_points:0, last_visit_date:null, registration_date:null },
  { id:3, name:'Екатерина', last_name:'Лебедева',  phone:'+7 902 345-67-89', email:null, avatar_color:'#9BB5D8', status:'active', tags:[], visit_count:8,  total_spent:0, active_subscription:null, loyalty_points:0, last_visit_date:null, registration_date:null },
  { id:4, name:'Наталья',   last_name:'Орлова',    phone:'+7 903 456-78-90', email:null, avatar_color:'#FCAE91', status:'vip',    tags:[], visit_count:31, total_spent:0, active_subscription:null, loyalty_points:0, last_visit_date:null, registration_date:null },
  { id:5, name:'Ирина',     last_name:'Зайцева',   phone:'+7 904 567-89-01', email:null, avatar_color:'#A3C9A8', status:'new',    tags:[], visit_count:5,  total_spent:0, active_subscription:null, loyalty_points:0, last_visit_date:null, registration_date:null },
  { id:6, name:'Светлана',  last_name:'Морозова',  phone:'+7 905 678-90-12', email:null, avatar_color:'#9BB5D8', status:'active', tags:[], visit_count:19, total_spent:0, active_subscription:null, loyalty_points:0, last_visit_date:null, registration_date:null },
];

export const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export const DAY_NAMES_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];