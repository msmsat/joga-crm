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
  WaTemplatesSyncResult,
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

  // WhatsApp подключается тем же Embedded Signup, что и на Velora AI (номер один
  // на всю CRM, см. routers/ai/whatsapp.py). Ручной ввод token + phone_number_id
  // остался только в Настройках → Интеграции — как запасной путь, если мастер
  // Meta недоступен. back говорит бэку, куда вернуть браузер после мастера.
  getWhatsappOauthUrl: () =>
    client.get<{ url: string }>('/ai/whatsapp/oauth-url?back=notifications'),

  disconnectWhatsApp: () =>
    client.delete<ChannelStatus>('/settings/integrations/whatsapp'),

  getWaPricing: () =>
    client.get<WaPricing>('/settings/integrations/whatsapp/pricing'),

  // Карту привязывают на стороне Meta, вебхука об этом нет — спрашиваем сами в
  // момент, когда ответ нужен: при открытии модалки и при включении тумблера.
  checkWaPayment: () =>
    client.post<ChannelStatus>('/settings/integrations/whatsapp/payment-check', {}),

  // Без одобренного шаблона Meta не даёт написать первым: свободный текст
  // доставляется только внутри 24-часового окна диалога. Заводит шаблоны всех
  // 38 событий на WABA студии — они уходят на модерацию, никому не пишут.
  syncWaTemplates: () =>
    client.post<WaTemplatesSyncResult>('/settings/integrations/whatsapp/templates-sync', {}),

  // Instagram подключается только по OAuth — тем же эндпоинтом, что и на Velora AI
  // (аккаунт один на обе поверхности, см. services/instagram_account.py). back
  // говорит бэку, куда вернуть браузер после согласия в Instagram.
  getInstagramOauthUrl: () =>
    client.get<{ url: string }>('/ai/instagram/oauth-url?back=notifications'),

  // Отдельного DELETE у Instagram нет — гасит общий /settings/integrations/{type}.
  disconnectInstagram: () =>
    client.delete<ChannelStatus>('/settings/integrations/instagram'),
}
