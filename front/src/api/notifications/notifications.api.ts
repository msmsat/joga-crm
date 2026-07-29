import { client } from '../client'
import type {
  EventToggle,
  MatrixRead,
  MatrixEventRow,
  UserPrefRead,
  UserPrefRow,
  UserPrefUpdate,
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

  getMatrix: () =>
    client.get<MatrixRead>('/settings/notifications/matrix'),

  // Ответ — строка матрицы целиком (обновлённые locked/locked_channels), не голый EventToggle.
  updateEventToggle: (payload: EventToggle) =>
    client.patch<MatrixEventRow>('/settings/notifications/events', payload),

  bulkUpdateEventToggles: (toggles: EventToggle[]) =>
    client.patch<EventToggle[]>('/settings/notifications/events/bulk', { toggles }),

  // Личный слой (EPIC 3, Задача 6) — все роли, только optional-события своей роли.
  getMyPrefs: () =>
    client.get<UserPrefRead>('/settings/notifications/me'),

  updateMyPref: (payload: UserPrefUpdate) =>
    client.patch<UserPrefRow>('/settings/notifications/me', payload),

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

  // Instagram подключается только по OAuth — тем же эндпоинтом, что и на Velora AI
  // (аккаунт один на обе поверхности, см. services/instagram_account.py). back
  // говорит бэку, куда вернуть браузер после согласия в Instagram.
  getInstagramOauthUrl: () =>
    client.get<{ url: string }>('/ai/instagram/oauth-url?back=notifications'),

  // Отдельного DELETE у Instagram нет — гасит общий /settings/integrations/{type}.
  disconnectInstagram: () =>
    client.delete<ChannelStatus>('/settings/integrations/instagram'),
}
