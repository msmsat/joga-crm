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
