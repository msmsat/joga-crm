import { create } from 'zustand';

export type NotifChannel = 'telegram' | 'whatsapp' | 'email';
export type NotifRole = 'client' | 'trainer' | 'admin' | 'owner';

type NotificationsUIState = {
  activeRole: NotifRole;                       // по умолчанию 'client' (ТЗ п.12)
  channels: Record<NotifChannel, boolean>;     // чекбоксы каналов
  setActiveRole: (r: NotifRole) => void;
  setChannel: (k: NotifChannel, v: boolean) => void;
  hydrateChannels: (c: Record<NotifChannel, boolean>) => void; // из GET /settings/notifications
};

export const useNotificationsStore = create<NotificationsUIState>((set) => ({
  activeRole: 'client',
  channels: { telegram: true, whatsapp: true, email: true },
  setActiveRole: (activeRole) => set({ activeRole }),
  setChannel: (k, v) => set((s) => ({ channels: { ...s.channels, [k]: v } })),
  hydrateChannels: (channels) => set({ channels }),
}));
