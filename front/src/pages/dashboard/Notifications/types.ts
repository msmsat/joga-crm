import type { JSX } from 'react';
import type { NotificationSettings, MatrixEventRow, NotificationTier } from '../../../api/notifications/notifications.types';
import type { NotifChannel, NotifRole } from '../../../stores/notificationsStore';
export type { NotificationSettings, MatrixEventRow, NotificationTier };

export type ChannelKey = NotifChannel;
export type Role = NotifRole;

// icon/color — чисто презентационные, событие как сущность (id, role, tier,
// default_channels) целиком приходит с бэка (EPIC 3, GET /matrix).
export type EventMeta = { icon: () => JSX.Element; color: string };
