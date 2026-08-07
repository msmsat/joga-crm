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

// EPIC 3 (ROADMAP_SETTINGS): матрица «событие × канал» с локами по tier.
export interface ChannelInfo {
  key: string
  connected: boolean
  global_enabled: boolean
}

export type NotificationTier = 'critical' | 'operational' | 'optional'

export interface MatrixEventRow {
  event_id: string
  role: string
  tier: NotificationTier
  channels: Record<string, boolean>
  locked: boolean            // критично — строку менять нельзя вообще
  locked_channels: string[]  // операционное — этот канал последний, снять нельзя
  lock_reason: 'critical' | 'last_channel' | null
}

export interface MatrixRead {
  channels: ChannelInfo[]
  events: MatrixEventRow[]
}

// EPIC 3, Задача 6: личный слой — только optional-события своей роли, сужает default.
export interface UserPrefRow {
  event_id: string
  channels: Record<string, boolean>
}

export interface UserPrefRead {
  events: UserPrefRow[]
}

export interface UserPrefUpdate {
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
  instagram: ChannelStatus
  email: ChannelStatus
}

export interface WaPricing {
  price_per_message: number
  currency: string
  source: 'meta' | 'default'
}

// Итог POST /settings/integrations/whatsapp/templates-sync: сколько шаблонов
// заведено, сколько уже было, сколько Meta не приняла.
export interface WaTemplatesSyncResult {
  created: number
  exists: number
  failed: number
}

// Вердикт модерации Meta по шаблонам (details.templates у канала WhatsApp).
// Каждый шаблон Meta одобряет отдельно, и отклонённый молча хоронит своё
// событие — отсюда rejected_events: id событий, чтобы показать, какие именно
// уведомления сейчас не доходят. null у канала — статусы ещё не читали.
export interface WaTemplateSummary {
  approved: number
  pending: number
  rejected: number
  rejected_events: string[]
  checked_at: string | null
}

export interface WaConnectPayload {
  token: string
  phone_number_id: string
  waba_id?: string | null
}

