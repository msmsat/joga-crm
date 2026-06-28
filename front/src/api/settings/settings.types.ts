export interface GeneralSettings {
  name: string
  timezone: string
  language: string
  currency: string
  date_format: string
  first_day_of_week: string
  journal_time_step: number
}

export interface WorkingHours {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
}

export interface Role {
  id: number
  name: string
  description: string | null
  color: string
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

export interface ApiToken {
  id: number
  name: string
  token_prefix: string
  created_at: string
  is_active: boolean
}

export interface Integration {
  integration_type: string
  is_active: boolean
  connected_at: string | null
  config: Record<string, unknown> | null
}
