import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotifChannel = 'telegram' | 'whatsapp' | 'instagram' | 'email';
export type NotifRole = 'client' | 'trainer' | 'admin' | 'owner';

type NotificationsUIState = {
  activeRole: NotifRole;                       // по умолчанию 'client' (ТЗ п.12)
  channels: Record<NotifChannel, boolean>;     // чекбоксы каналов
  setActiveRole: (r: NotifRole) => void;
  setChannel: (k: NotifChannel, v: boolean) => void;
  hydrateChannels: (c: Record<NotifChannel, boolean>) => void; // из GET /settings/notifications
};

// persist: запоминаем только выбранную вкладку роли между перезагрузками.
// channels не персистим — они гидрируются с сервера при каждом входе.
export const useNotificationsStore = create<NotificationsUIState>()(
  persist(
    (set) => ({
      activeRole: 'client',
      channels: { telegram: false, whatsapp: false, instagram: false, email: false },
      setActiveRole: (activeRole) => set({ activeRole }),
      setChannel: (k, v) => set((s) => ({ channels: { ...s.channels, [k]: v } })),
      hydrateChannels: (channels) => set({ channels }),
    }),
    {
      name: 'velora-notifications-ui',
      partialize: (s) => ({ activeRole: s.activeRole }),
    },
  ),
);
