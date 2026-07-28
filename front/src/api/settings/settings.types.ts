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
  device: string
  platform: string
  browser: string | null
  ip_address: string | null
  location_city: string | null
  location_country: string | null
  last_active: string
  is_current: boolean
}

export interface TwoFaStatus {
  enabled: boolean
}

export interface ExportArchivePayload {
  include: Array<'clients' | 'finances' | 'schedule'>
}

export interface WipeDataResult {
  deleted: Record<string, number>
}

export interface DeleteAccountResult {
  redirect: string
}

export type IntegrationType = 'telegram' | 'whatsapp' | 'instagram' | 'google_calendar'

export interface Integration {
  type: IntegrationType
  connected: boolean
  connected_at: string | null
  details: Record<string, string | boolean | null> | null
  capabilities: string[]
}

export interface GoogleCalendarInfo {
  id: string
  name: string
  primary: boolean
}

export interface GoogleSyncResult {
  pushed: number
  pulled: number
  errors: string[]
}

export interface GoogleCalendarUpdatePayload {
  calendar_id?: string
  sync_mode?: 'push' | 'two_way'
}

export interface WaConnectIntegrationPayload {
  token: string
  phone_number_id: string
  waba_id?: string
}

export interface IgConnectPayload {
  token: string
  ig_user_id: string
}
