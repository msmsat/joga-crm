import type { SourceJournalItem } from './bumpix/types';
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
  /** Imported immutable snapshot, never a native lesson ID. */
  source?: SourceJournalItem;
  id: number;
  trainer: number;
  timeStart: number;
  timeEnd: number;
  title: string;
  hall: string;
  clients: number;
  /** Сколько записанных отмечены «пришёл». Нет у оптимистичной карточки. */
  attended?: number;
  /** Сколько отмечены «не пришёл» — по ним сетка рисует неявку (utils.isNoShow). */
  noShows?: number;
  /** Сколько записанных ещё не заплатили. Нет у оптимистичной карточки. */
  unpaid?: number;
  /** Мастер занятия «Анна Новикова» — подпись карточки там, где колонка не мастер. */
  trainerName?: string;
  /** Клиент индивидуальной записи: карточка подписана им, а не услугой. */
  clientName?: string;
  clientColor?: string;
  maxClients: number;
  color: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  date?: string;
  cancelReason: string | null;
  clientsNotified: boolean;
  /** Заметка студии о занятии и снимки к ней — внутренние, клиенту не уходят. */
  notes: string;
  photos: string[];
  serviceId: number | null;
  /** Цена ЭТОГО занятия. Денормализована на занятии, а не взята у услуги: её
   *  считают по тренеру в момент создания (back/services/service_pricing.py) и
   *  правят под конкретное занятие. Клиент платит ровно её. */
  price: number;
  /** HB-22: карточка индивидуальной записи не рисует счётчик участников. */
  bookingMode: 'event' | 'resource';
  /** Версия интервала — уходит как expected_version при переносе. */
  version: number;
  branchId: number | null;
  /** Буферы в минутах: сетка рисует их рядом с карточкой другим тоном —
   *  время занято, хотя занятия в нём нет. Нет у оптимистичной карточки. */
  bufferBefore?: number;
  bufferAfter?: number;
}
