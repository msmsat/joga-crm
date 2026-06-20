// constants.ts

// Импортируем типы, так как они нужны для типизации констант
import type { Booking, Client } from './types';

export const TRAINERS = [
  { id: 0, name: 'Анна Н.', full: 'Анна Новикова', role: 'Пилатес', color: '#F9A08B', bg: 'rgba(249,160,139,0.12)', initials: 'АН' },
  { id: 1, name: 'Дарья П.', full: 'Дарья Петрова', role: 'Йога', color: '#5BAB72', bg: 'rgba(91,171,114,0.12)', initials: 'ДП' },
  { id: 2, name: 'Михаил В.', full: 'Михаил Волков', role: 'Стретчинг', color: '#40a8a0', bg: 'rgba(64,168,160,0.12)', initials: 'МВ' },
  { id: 3, name: 'Ольга С.', full: 'Ольга Смирнова', role: 'Фитнес', color: '#4A80C4', bg: 'rgba(74,128,196,0.12)', initials: 'ОС' },
  { id: 4, name: 'Иван К.', full: 'Иван Козлов', role: 'Кросс', color: '#7B6CD4', bg: 'rgba(123,108,212,0.12)', initials: 'ИК' },
];

export const HALLS = ['Зал 1', 'Зал 2', 'Студия', 'Онлайн'];
export const TIMES = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

export const BOOKINGS: Booking[] = [
  { id:'b1', trainer:0, timeStart:2, timeEnd:3, title:'Пилатес', hall:'Зал 1', clients:6, maxClients:8, color:'#F9A08B', status:'confirmed', date: '2026-06-20' },
  { id:'b2', trainer:0, timeStart:4, timeEnd:5, title:'Пил. Advanced', hall:'Зал 1', clients:4, maxClients:6, color:'#F9A08B', status:'confirmed', date: '2026-06-20' },
  { id:'b3', trainer:0, timeStart:8, timeEnd:9, title:'Персональный', hall:'Студия', clients:1, maxClients:1, color:'#F9A08B', status:'confirmed', date: '2026-06-20' },
  { id:'b4', trainer:0, timeStart:12, timeEnd:13, title:'Вечерний', hall:'Зал 1', clients:7, maxClients:8, color:'#F9A08B', status:'pending', date: '2026-06-20' },
  { id:'b5', trainer:1, timeStart:1, timeEnd:2, title:'Йога Хатха', hall:'Зал 2', clients:10, maxClients:12, color:'#5BAB72', status:'confirmed', date: '2026-06-20' },
  { id:'b6', trainer:1, timeStart:5, timeEnd:6, title:'Флоу', hall:'Зал 2', clients:8, maxClients:12, color:'#5BAB72', status:'confirmed', date: '2026-06-20' },
  { id:'b7', trainer:1, timeStart:10, timeEnd:11, title:'Аштанга', hall:'Зал 2', clients:5, maxClients:10, color:'#5BAB72', status:'confirmed', date: '2026-06-20' },
  { id:'b8', trainer:2, timeStart:3, timeEnd:4, title:'Стретчинг', hall:'Студия', clients:3, maxClients:4, color:'#40a8a0', status:'confirmed', date: '2026-06-20' },
  { id:'b9', trainer:2, timeStart:7, timeEnd:8, title:'Стретч+', hall:'Студия', clients:4, maxClients:4, color:'#40a8a0', status:'confirmed', date: '2026-06-20' },
  { id:'b10', trainer:2, timeStart:11, timeEnd:12, title:'Вечерний', hall:'Зал 1', clients:6, maxClients:8, color:'#40a8a0', status:'pending', date: '2026-06-20' },
  { id:'b11', trainer:3, timeStart:0, timeEnd:1, title:'Открытие', hall:'Зал 1', clients:0, maxClients:0, color:'#4A80C4', status:'confirmed', date: '2026-06-20' },
  { id:'b12', trainer:3, timeStart:9, timeEnd:10, title:'Планёрка', hall:'Онлайн', clients:5, maxClients:10, color:'#4A80C4', status:'confirmed', date: '2026-06-20' },
  { id:'b13', trainer:4, timeStart:2, timeEnd:3, title:'Фитбол', hall:'Зал 2', clients:9, maxClients:12, color:'#7B6CD4', status:'confirmed', date: '2026-06-20' },
  { id:'b14', trainer:4, timeStart:8, timeEnd:9, title:'Роллинг', hall:'Зал 1', clients:5, maxClients:8, color:'#7B6CD4', status:'confirmed', date: '2026-06-20' },
  { id:'b15', trainer:4, timeStart:13, timeEnd:14, title:'Кросс-тренинг', hall:'Зал 2', clients:7, maxClients:10, color:'#7B6CD4', status:'pending', date: '2026-06-20' },
];

export const CLIENTS_DB: Client[] = [
  { id:'c1', name:'Мария Соколова', phone:'+7 900 123-45-67', visits:24, avatar:'МС' },
  { id:'c2', name:'Алина Крылова', phone:'+7 901 234-56-78', visits:12, avatar:'АК' },
  { id:'c3', name:'Екатерина Лебедева', phone:'+7 902 345-67-89', visits:8, avatar:'ЕЛ' },
  { id:'c4', name:'Наталья Орлова', phone:'+7 903 456-78-90', visits:31, avatar:'НО' },
  { id:'c5', name:'Ирина Зайцева', phone:'+7 904 567-89-01', visits:5, avatar:'ИЗ' },
  { id:'c6', name:'Светлана Морозова', phone:'+7 905 678-90-12', visits:19, avatar:'СМ' },
];

export const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export const DAY_NAMES_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];