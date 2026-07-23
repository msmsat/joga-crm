import type { JSX } from 'react';
import type { NotificationSettings, EventToggle } from '../../../api/notifications/notifications.types';
import type { NotifChannel, NotifRole } from '../../../stores/notificationsStore';
export type { NotificationSettings, EventToggle };

export type ChannelKey = NotifChannel;
export type Role = NotifRole;
export type NotifEvent = {
  id: string;
  icon: () => JSX.Element;
  color: string;
};
export type Toggles = Record<string, Record<ChannelKey, boolean>>;
