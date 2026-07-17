// constants.ts

// Импортируем типы, так как они нужны для типизации констант
import type { ClientListItem } from './types';

// Тренеры, залы и занятия приходят из API — см. hooks/useSchedule.ts
export const TIMES = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

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