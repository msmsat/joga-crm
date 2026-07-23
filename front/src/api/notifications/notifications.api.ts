import { client } from '../client'
import type {
  EventToggle,
  NotificationSettings,
  NotifyChannelsStatus,
  ChannelStatus,
  WaPricing,
  WaConnectPayload,
} from './notifications.types'

export const notificationsApi = {
  getSettings: () =>
    client.get<NotificationSettings>('/settings/notifications'),

  updateSettings: (payload: Partial<NotificationSettings>) =>
    client.patch<NotificationSettings>('/settings/notifications', payload),

  getEventToggles: () =>
    client.get<EventToggle[]>('/settings/notifications/events'),

  updateEventToggle: (payload: EventToggle) =>
    client.patch<EventToggle>('/settings/notifications/events', payload),

  getChannelIntegrations: () =>
    client.get<NotifyChannelsStatus>('/settings/integrations/notify-channels'),

  connectTelegram: (token: string) =>
    client.post<ChannelStatus>('/settings/integrations/telegram', { token }),

  disconnectTelegram: () =>
    client.delete<ChannelStatus>('/settings/integrations/telegram'),

  requestEmailCode: (email: string) =>
    client.post<ChannelStatus>('/settings/integrations/email/request-code', { email }),

  verifyEmailCode: (code: string) =>
    client.post<ChannelStatus>('/settings/integrations/email/verify', { code }),

  connectWhatsApp: (payload: WaConnectPayload) =>
    client.post<ChannelStatus>('/settings/integrations/whatsapp', payload),

  disconnectWhatsApp: () =>
    client.delete<ChannelStatus>('/settings/integrations/whatsapp'),

  getWaPricing: () =>
    client.get<WaPricing>('/settings/integrations/whatsapp/pricing'),
}
