import type { Lesson, Hall, Reservation } from '../../../api/schedule/schedule.types';
import type { ClientListItem } from '../../../api/clients/clients.types';
export type { Lesson, Hall, Reservation, ClientListItem };

// Колонка журнала: реальный сотрудник + производные данные для UI (цвет, инициалы)
export interface Trainer {
  id: number;
  name: string;      // «Анна Н.»
  full: string;      // «Анна Новикова»
  role: string;      // должность (department)
  color: string;
  bg: string;
  initials: string;
}

// Колонка сетки журнала: тренер (режим «тренеры»), название зала (режим «залы»)
// или дата (недельный вид) — что именно, решает viewMode/calendarView.
export type JournalColumn = Trainer | string | Date;

export interface Booking {
  id: number;
  trainer: number;
  timeStart: number;
  timeEnd: number;
  title: string;
  hall: string;
  clients: number;
  maxClients: number;
  color: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  date?: string;
  cancelReason: string | null;
  clientsNotified: boolean;
  serviceId: number | null;
}
