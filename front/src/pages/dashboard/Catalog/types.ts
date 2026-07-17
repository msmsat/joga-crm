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
  id: number;
  name: string;
  category: string;
  type: ServiceType;
  duration_min: number;
  price: number;
  color: string;
  description: string;
  max_clients?: number;
  bookings_total: number;
  revenue_total: number;
  bookings_last_30d: number;
}
