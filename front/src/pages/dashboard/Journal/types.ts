import type { Lesson, Hall, Reservation } from '../../../api/schedule/schedule.types';
import type { ClientListItem } from '../../../api/clients/clients.types';
export type { Lesson, Hall, Reservation, ClientListItem };

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
}
