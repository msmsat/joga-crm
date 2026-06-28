import type { JSX } from 'react';
import type { NotificationSettings, EventToggle } from '../../../api/notifications/notifications.types';
export type { NotificationSettings, EventToggle };

export type ChannelKey = 'telegram' | 'instagram' | 'whatsapp' | 'email' | 'sms' | 'push';
export type Role = 'client' | 'trainer' | 'admin' | 'owner';
export type NotifEvent = {
  id: string;
  icon: () => JSX.Element;
  title: string;
  desc: string;
  color: string;
};
export type Toggles = Record<string, Record<ChannelKey, boolean>>;
