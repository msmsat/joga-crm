import type { ServiceBookingMode, TerminologyProfile } from '../../../api/booking/hybrid.types';

export type CatalogTab = 'studios' | 'services' | 'subscriptions';

export interface Hall {
  id: number;
  name: string;
  capacity: number;
  area: number;
  color: string;
  equipment: string[];
  price_per_hour: number;
}

export interface StudioWorkingHours {
  day_index: number;
  day_short: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

export interface Studio {
  id: number;
  name: string;
  country: string;
  city: string;
  street: string;
  halls: Hall[];
  working_hours: StudioWorkingHours[];
  phone?: string;
  email?: string;
}

export type ServiceType = 'group' | 'individual';

export interface Service {
  bundle_items: import('../../../api/studio/services.api').ServiceBundlePart[];
  bundle_full_price: number | null;
  in_bundles: { id: number; name: string }[];
  masters: import('../../../api/studio/services.api').ServiceMaster[];
  id: number;
  name: string;
  category: string;
  type: ServiceType;
  duration_min: number;
  // Длительность с поправкой на мастера — «от–до», как у цены (решил сервер).
  duration_from: number;
  duration_to: number;
  price: number;
  // Во что услуга обходится клиенту с поправкой на мастера: у разных мастеров
  // она своя. Совпали — Каталог пишет одну сумму, разошлись — «от–до».
  // Сравнивать их здесь не нужно, это решил сервер (service_pricing.py).
  price_min: number;
  price_max: number;
  color: string;
  description: string;
  max_clients?: number;
  bookings_total: number;
  revenue_total: number;
  bookings_last_30d: number;
  // HB-15: механика записи приходит с сервера отдельным полем. Выводить её из
  // `type` запрещено: индивидуальный формат ещё не значит выбор времени.
  booking_mode: ServiceBookingMode;
  buffer_before_min: number;
  buffer_after_min: number;
  is_bookable: boolean;
  terminology_profile: TerminologyProfile | null;
}
