export interface NotificationSettings {
  telegram: boolean
  instagram: boolean
  whatsapp: boolean
  email: boolean
  sms: boolean
  push: boolean
  marketing_emails: boolean
  primary_email: string | null
  backup_email: string | null
}

export interface EventToggle {
  role: string
  event_id: string
  channel_key: string
  is_enabled: boolean
}

export interface ChannelStatus {
  connected: boolean
  details: Record<string, unknown>
}

export interface NotifyChannelsStatus {
  telegram: ChannelStatus
  whatsapp: ChannelStatus
  email: ChannelStatus
}

export interface WaPricing {
  price_per_message: number
  currency: string
  source: 'meta' | 'default'
}

export interface WaConnectPayload {
  token: string
  phone_number_id: string
  waba_id?: string | null
}
