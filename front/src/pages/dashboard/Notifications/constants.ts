import type { JSX } from 'react';
import type { ChannelKey, Role, NotifEvent } from './types';
import { Icon } from './components/ui/NotificationIcons';

export const CHANNELS: { key: ChannelKey; label: string; sub: string; IconComp: () => JSX.Element; color: string }[] = [
  { key: 'telegram',  label: 'Telegram',  sub: '@VeloraNotifyBot',       IconComp: Icon.Telegram,  color: '#4A80C4' },
  { key: 'whatsapp',  label: 'WhatsApp',  sub: '+7 (999) 123-45-67',     IconComp: Icon.WhatsApp,  color: '#5BAB72' },
  { key: 'email',     label: 'Email',     sub: 'admin@velora.studio',     IconComp: Icon.Email,     color: '#F9A08B' },
];

export const ROLES: { key: Role; IconComp: () => JSX.Element; color: string; bg: string }[] = [
  { key: 'client',  IconComp: Icon.Client,  color: '#F9A08B', bg: 'rgba(249,160,139,0.1)' },
  { key: 'trainer', IconComp: Icon.Trainer, color: '#4A80C4', bg: 'rgba(74,128,196,0.1)'  },
  { key: 'admin',   IconComp: Icon.Admin,   color: '#5BAB72', bg: 'rgba(91,171,114,0.1)'  },
  { key: 'owner',   IconComp: Icon.Owner,   color: '#9B8EC4', bg: 'rgba(155,142,196,0.1)' },
];

export const NOTIF_EVENTS: Record<Role, NotifEvent[]> = {
  client: [
    { id: 'c1',  icon: Icon.Calendar,      color: '#F9A08B' },
    { id: 'c2',  icon: Icon.AlertTriangle, color: '#f0c040' },
    { id: 'c3',  icon: Icon.UserX,         color: '#D88C9A' },
    { id: 'c4',  icon: Icon.Money,         color: '#5BAB72' },
    { id: 'c5',  icon: Icon.Package,       color: '#f0c040' },
    { id: 'c6',  icon: Icon.AlertTriangle, color: '#e08060' },
    { id: 'c7',  icon: Icon.Gift,          color: '#F9A08B' },
    { id: 'c8',  icon: Icon.Star,          color: '#9B8EC4' },
    { id: 'c9',  icon: Icon.Refresh,       color: '#4A80C4' },
    { id: 'c11', icon: Icon.Clock,         color: '#9B8EC4' },
  ],
  trainer: [
    { id: 't1', icon: Icon.Calendar,      color: '#F9A08B' },
    { id: 't2', icon: Icon.UserX,         color: '#D88C9A' },
    { id: 't3', icon: Icon.AlertTriangle, color: '#f0c040' },
    { id: 't4', icon: Icon.Users,         color: '#4A80C4' },
    { id: 't5', icon: Icon.Clock,         color: '#9B8EC4' },
    { id: 't6', icon: Icon.Money,         color: '#5BAB72' },
    { id: 't7', icon: Icon.FileText,      color: '#F9A08B' },
    { id: 't8', icon: Icon.Gift,          color: '#e08060' },
  ],
  admin: [
    { id: 'a1',  icon: Icon.Calendar,      color: '#F9A08B' },
    { id: 'a2',  icon: Icon.UserX,         color: '#D88C9A' },
    { id: 'a3',  icon: Icon.Users,         color: '#5BAB72' },
    { id: 'a4',  icon: Icon.Money,         color: '#5BAB72' },
    { id: 'a6',  icon: Icon.Package,       color: '#e08060' },
    { id: 'a7',  icon: Icon.Clock,         color: '#D88C9A' },
    { id: 'a8',  icon: Icon.FileText,      color: '#4A80C4' },
    { id: 'a9',  icon: Icon.Lock,          color: '#9B8EC4' },
    { id: 'a10', icon: Icon.Refresh,       color: '#4A80C4' },
  ],
  owner: [
    { id: 'o1', icon: Icon.TrendUp,       color: '#F9A08B' },
    { id: 'o2', icon: Icon.BarChart,      color: '#4A80C4' },
    { id: 'o3', icon: Icon.Money,         color: '#5BAB72' },
    { id: 'o4', icon: Icon.AlertTriangle, color: '#D88C9A' },
    { id: 'o5', icon: Icon.Users,         color: '#9B8EC4' },
    { id: 'o6', icon: Icon.CreditCard,    color: '#f0c040' },
    { id: 'o7', icon: Icon.Lock,          color: '#e08060' },
    { id: 'o8', icon: Icon.Star,          color: '#5BAB72' },
    { id: 'o9', icon: Icon.FileText,      color: '#D88C9A' },
  ],
};
