import type { ActiveSubscription, ClientLoyaltyLevel, ClientNote, ClientProduct } from '../../../api/clients/clients.types';
export type { ActiveSubscription, ClientLoyaltyLevel, ClientNote, ClientProduct };

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
  subscription_alert?: ActiveSubscription;
  products: ClientProduct[];
  loyalty_points: number;
  /** null/undefined — у студии нет лестницы уровней, блок уровня не рисуется. */
  loyalty_level?: ClientLoyaltyLevel | null;
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
  /** Сумма неоплаченных занятий («оплата на месте»); приходит только в карточке. */
  debt?: number;
  /** Номер подтверждён Telegram, а не введён руками. */
  phone_verified?: boolean;
  notes?: ClientNote[];
  frozen?: boolean;
}

export interface EventRecord {
  date?: string;
  type: 'payment' | 'visit' | 'booking' | 'cancel' | 'bonus' | 'freeze';
  title: string;
  trainer?: string;
  paid?: string;
  amount?: string;
}

export type EventFilterTab = 'all' | 'payment' | 'visit' | 'booking' | 'cancel' | 'bonus' | 'freeze';
