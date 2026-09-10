import { client } from '../client'
import type { ServiceBookingMode, TerminologyProfile } from '../booking/hybrid.types'

// Зеркало бэкенд-схемы ServiceRead (back/schemas/studio/studio.py).
export interface ServiceRead {
  id: number
  name: string
  description: string | null
  price: number
  duration_min: number
  category: string | null
  service_type: string | null
  color: string | null
  max_clients: number | null
  bookings_count: number
  revenue_total: number
  bookings_last_30d: number
  // HB-15: механика записи — отдельное поле, а не вывод из service_type.
  // Формат обслуживания (group/individual) и механика (event/resource) —
  // разные оси, и выводить одну из другой запрещено (§4.4).
  booking_mode: ServiceBookingMode
  buffer_before_min: number
  buffer_after_min: number
  is_bookable: boolean
  terminology_profile: TerminologyProfile | null
}

export interface ServiceCreate {
  name: string
  price: number
  duration_min?: number
  description?: string | null
  category?: string | null
  service_type?: string | null
  color?: string | null
  max_clients?: number | null
  booking_mode?: ServiceBookingMode
  buffer_before_min?: number
  buffer_after_min?: number
  is_bookable?: boolean
  terminology_profile?: TerminologyProfile | null
}

export type ServiceUpdate = Partial<ServiceCreate>

// Слот реального занятия услуги на текущей неделе (day_of_week: 0=Пн…6=Вс).
export interface ServiceWeekSlot {
  day_of_week: number
  hour: number
}

export const servicesApi = {
  list: () =>
    client.get<ServiceRead[]>('/studio/services'),

  get: (serviceId: number) =>
    client.get<ServiceRead>(`/studio/services/${serviceId}`),

  create: (data: ServiceCreate) =>
    client.post<ServiceRead>('/studio/services', data),

  update: (serviceId: number, data: ServiceUpdate) =>
    client.patch<ServiceRead>(`/studio/services/${serviceId}`, data),

  delete: (serviceId: number) =>
    client.delete<void>(`/studio/services/${serviceId}`),

  getWeek: (serviceId: number) =>
    client.get<ServiceWeekSlot[]>(`/studio/services/${serviceId}/week`),
}
