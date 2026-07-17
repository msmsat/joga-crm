import type { ActiveSubscription, ClientNote } from '../../../api/clients/clients.types';
export type { ActiveSubscription, ClientNote };

export interface ClientData {
  id: number;
  name: string;
  last_name?: string;
  avatar_color?: string;
  status: string;
  tags: string[];
  visit_count: number;
  total_spent: number;
  active_subscription?: ActiveSubscription;
  loyalty_points: number;
  last_visit_date?: string;
  registration_date?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  city?: string;
  source?: string;
  notifs_enabled?: boolean;
  reminders_enabled?: boolean;
  is_active?: boolean;
  notes?: ClientNote[];
  frozen?: boolean;
}

export interface EventRecord {
  date?: string;
  type: 'payment' | 'visit' | 'freeze';
  title: string;
  trainer?: string;
  paid?: string;
  amount?: string;
}

export type EventFilterTab = 'Все' | 'Оплаты' | 'Посещения' | 'Заморозки';

export interface BonusOption {
  id: string;
  label: string;
  description: string;
  points?: number; // задан только у бонуса-начисления баллов; остальные — символические
}
