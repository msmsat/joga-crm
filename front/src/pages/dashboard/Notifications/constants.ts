import type { JSX } from 'react';
import type { ChannelKey, Role, EventMeta } from './types';
import { Icon } from './components/ui/NotificationIcons';

export const CHANNELS: { key: ChannelKey; label: string; sub: string; IconComp: () => JSX.Element; color: string }[] = [
  { key: 'telegram',  label: 'Telegram',  sub: '@VeloraNotifyBot',       IconComp: Icon.Telegram,  color: '#4A80C4' },
  { key: 'whatsapp',  label: 'WhatsApp',  sub: '+7 (999) 123-45-67',     IconComp: Icon.WhatsApp,  color: '#5BAB72' },
  { key: 'instagram', label: 'Instagram', sub: '@studio',                IconComp: Icon.Instagram, color: '#C13584' },
  { key: 'email',     label: 'Email',     sub: 'admin@velora.studio',     IconComp: Icon.Email,     color: '#F9A08B' },
];

export const ROLES: { key: Role; IconComp: () => JSX.Element; color: string; bg: string }[] = [
  { key: 'client',  IconComp: Icon.Client,  color: '#F9A08B', bg: 'rgba(249,160,139,0.1)' },
  { key: 'trainer', IconComp: Icon.Trainer, color: '#4A80C4', bg: 'rgba(74,128,196,0.1)'  },
  { key: 'admin',   IconComp: Icon.Admin,   color: '#5BAB72', bg: 'rgba(91,171,114,0.1)'  },
  { key: 'owner',   IconComp: Icon.Owner,   color: '#9B8EC4', bg: 'rgba(155,142,196,0.1)' },
];

// Иконка/цвет на event_id — только оформление. Какие события существуют, какой
// у них tier и роль — приходит с бэка (services/notification_catalog.py) через
// GET /settings/notifications/matrix; дублировать список здесь не нужно и вредно
// (эпик 3 как раз лечит дрейф фронта от реального каталога уведомлений).
export const EVENT_META: Record<string, EventMeta> = {
  c1:  { icon: Icon.Calendar,      color: '#F9A08B' },
  c2:  { icon: Icon.AlertTriangle, color: '#f0c040' },
  c3:  { icon: Icon.UserX,         color: '#D88C9A' },
  c4:  { icon: Icon.Money,         color: '#5BAB72' },
  c5:  { icon: Icon.Package,       color: '#f0c040' },
  c6:  { icon: Icon.AlertTriangle, color: '#e08060' },
  c7:  { icon: Icon.Gift,          color: '#F9A08B' },
  c8:  { icon: Icon.Star,          color: '#9B8EC4' },
  c9:  { icon: Icon.Refresh,       color: '#4A80C4' },
  c11: { icon: Icon.Clock,         color: '#9B8EC4' },
  c12: { icon: Icon.Star,          color: '#5BAB72' },
  t1:  { icon: Icon.Calendar,      color: '#F9A08B' },
  t2:  { icon: Icon.UserX,         color: '#D88C9A' },
  t3:  { icon: Icon.AlertTriangle, color: '#f0c040' },
  t4:  { icon: Icon.Users,         color: '#4A80C4' },
  t5:  { icon: Icon.Clock,         color: '#9B8EC4' },
  t6:  { icon: Icon.Money,         color: '#5BAB72' },
  t7:  { icon: Icon.FileText,      color: '#F9A08B' },
  t8:  { icon: Icon.Gift,          color: '#e08060' },
  t9:  { icon: Icon.UserX,         color: '#D88C9A' },
  a1:  { icon: Icon.Calendar,      color: '#F9A08B' },
  a2:  { icon: Icon.UserX,         color: '#D88C9A' },
  a3:  { icon: Icon.Users,         color: '#5BAB72' },
  a4:  { icon: Icon.Money,         color: '#5BAB72' },
  a6:  { icon: Icon.Package,       color: '#e08060' },
  a7:  { icon: Icon.Clock,         color: '#D88C9A' },
  a8:  { icon: Icon.FileText,      color: '#4A80C4' },
  a9:  { icon: Icon.Lock,          color: '#9B8EC4' },
  a10: { icon: Icon.Refresh,       color: '#4A80C4' },
  o1:  { icon: Icon.TrendUp,       color: '#F9A08B' },
  o2:  { icon: Icon.BarChart,      color: '#4A80C4' },
  o3:  { icon: Icon.Money,         color: '#5BAB72' },
  o4:  { icon: Icon.AlertTriangle, color: '#D88C9A' },
  o5:  { icon: Icon.Users,         color: '#9B8EC4' },
  o6:  { icon: Icon.CreditCard,    color: '#f0c040' },
  o7:  { icon: Icon.Lock,          color: '#e08060' },
  o8:  { icon: Icon.Star,          color: '#5BAB72' },
  o9:  { icon: Icon.FileText,      color: '#D88C9A' },
};

// Событие без записи в EVENT_META (новый event_id, ещё не расставлены иконки) —
// нейтральный дефолт, чтобы матрица не падала, а редактор потом просто добавил строку выше.
export const DEFAULT_EVENT_META: EventMeta = { icon: Icon.FileText, color: '#999999' };
