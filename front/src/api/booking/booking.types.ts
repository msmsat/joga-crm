export type BookingChannelType = 'telegram' | 'instagram' | 'whatsapp' | 'web'

export interface BookingChannel {
  channel_type: BookingChannelType
  is_active: boolean
  connected_at: string | null
  config: Record<string, unknown> | null
}

export interface BookingSettings {
  booking_active: boolean
  prefill_on_booking: boolean
  trainer_confirmation_required: boolean
  client_reminder_enabled: boolean
  repeat_booking_allowed: boolean
  min_booking_advance_min: number
  booking_window_days: number
  cancellation_deadline_min: number
  widget_accent_color: string | null
  widget_logo_url: string | null
  widget_dark_mode: boolean
  widget_language: string
  reminder_24h: boolean
  reminder_2h: boolean
  review_request: boolean
  miniapp_generated: boolean
  widget_work_start: string
  widget_work_end: string
  /** «Кофе после занятия» в мини-приложении: спрашивать ли и куда звать. */
  coffee_enabled: boolean
  coffee_spots: CoffeeSpot[]
  /** Публичная ссылка на мини-приложение студии — считается на бэке, только чтение. */
  miniapp_url: string
}

export interface CoffeeSpot {
  name: string
  address: string
  url: string | null
}
