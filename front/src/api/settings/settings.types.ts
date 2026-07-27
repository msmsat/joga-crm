export interface GeneralSettings {
  name: string
  timezone: string
  language: string
  currency: string
  date_format: string
  first_day_of_week: string
  journal_time_step: number
}

export interface UserSession {
  id: number
  device: string | null
  platform: string | null
  browser: string | null
  location_city: string | null
  location_country: string | null
  last_active: string
  is_current: boolean
}

export interface Integration {
  integration_type: string
  is_active: boolean
  connected_at: string | null
  config: Record<string, unknown> | null
}
