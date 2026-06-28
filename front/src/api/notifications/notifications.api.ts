import { client } from '../client'
import type { EventToggle, NotificationSettings } from './notifications.types'

export const notificationsApi = {
  getSettings: () =>
    client.get<NotificationSettings>('/settings/notifications'),

  updateSettings: (payload: Partial<NotificationSettings>) =>
    client.patch<NotificationSettings>('/settings/notifications', payload),

  getEventToggles: () =>
    client.get<EventToggle[]>('/settings/notifications/events'),

  updateEventToggle: (payload: EventToggle) =>
    client.patch<EventToggle>('/settings/notifications/events', payload),
}
