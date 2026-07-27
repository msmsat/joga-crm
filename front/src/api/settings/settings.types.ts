export interface GeneralSettings {
  name: string
  description: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  logo_url: string | null
  timezone: string | null
  language: string | null
  currency: string | null
  date_format: string | null
  first_day_of_week: string | null
  journal_time_step: number
}

// Поля, доступные для PATCH — logo_url пишется отдельным эндпоинтом (studioApi.uploadStudioLogo).
export type GeneralUpdate = Partial<Omit<GeneralSettings, 'logo_url'>>

export interface AppearanceSettings {
  theme: string | null
  accent_color: string | null
}

export type AppearanceUpdate = Partial<AppearanceSettings>

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
