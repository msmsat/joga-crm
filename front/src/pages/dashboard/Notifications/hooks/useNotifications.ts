import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ChannelKey, EventToggle, Role, Toggles } from '../types';
import { CHANNELS, ROLES, NOTIF_EVENTS } from '../constants';
import { buildInitialToggles, mergeToggles, diffToggles } from '../utils';
import { notificationsApi } from '../../../../api/notifications';
import { queryKeys } from '../../../../api/queryKeys';
import { useNotificationsStore } from '../../../../stores/notificationsStore';
import { useToast } from '../../../../components/ui/Toast';
import { errorMessage } from '../../../../api/errorMessage';
import type { NotifyChannelsStatus } from '../../../../api/notifications/notifications.types';

const INTEGRATION_CHANNELS = new Set<ChannelKey>(['telegram', 'email', 'whatsapp']);

function isIntegrationConnected(statuses: NotifyChannelsStatus | undefined, key: ChannelKey): boolean {
  if (!statuses) return false;
  if (key === 'telegram') return statuses.telegram.connected;
  if (key === 'email') return statuses.email.connected;
  if (key === 'whatsapp') return statuses.whatsapp.connected;
  return false;
}

// Отдельный хук: вызывается до useChannelIntegrations, чтобы её onConnected-колбэк
// (enableChannel) существовал раньше useNotifications, которому нужен статус интеграций.
export function useEnableChannel() {
  const setChannel = useNotificationsStore(s => s.setChannel);
  // После подключения канала в модалке: интеграция уже сохранена на бэке,
  // здесь включаем сам тумблер настроек (PATCH + локальный стейт), без отката
  // при ошибке — подключение уже состоялось, тумблер лишь отражает его.
  return (key: ChannelKey) => {
    setChannel(key, true);
    notificationsApi.updateSettings({ [key]: true }).catch(() => {});
  };
}

export function useNotifications(channelStatuses?: NotifyChannelsStatus, onNeedsConnect?: (key: ChannelKey) => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { activeRole, setActiveRole, channels, setChannel, hydrateChannels } = useNotificationsStore();

  const settingsQ = useQuery({ queryKey: queryKeys.notificationSettings, queryFn: notificationsApi.getSettings });
  const togglesQ = useQuery({ queryKey: queryKeys.notificationEventToggles, queryFn: notificationsApi.getEventToggles });

  const updateSettingsMut = useMutation({ mutationFn: notificationsApi.updateSettings });
  const saveTogglesMut = useMutation({
    mutationFn: (changes: EventToggle[]) => Promise.all(changes.map(notificationsApi.updateEventToggle)),
  });

  const [toggles, setToggles] = useState<Toggles>(buildInitialToggles);
  const [savedToggles, setSavedToggles] = useState<Toggles>(buildInitialToggles);

  useEffect(() => {
    if (!settingsQ.data) return;
    hydrateChannels({
      telegram: settingsQ.data.telegram, whatsapp: settingsQ.data.whatsapp, email: settingsQ.data.email,
    });
  }, [settingsQ.data, hydrateChannels]);

  useEffect(() => {
    if (settingsQ.error) toast.error(errorMessage(settingsQ.error, t));
  }, [settingsQ.error, toast, t]);

  useEffect(() => {
    if (togglesQ.error) toast.error(errorMessage(togglesQ.error, t));
  }, [togglesQ.error, toast, t]);

  const isDirty = JSON.stringify(toggles) !== JSON.stringify(savedToggles);

  // Синхронизация черновика с сервером без useEffect (React: adjusting state
  // during render, через useState вместо useRef — set-state-in-effect и
  // refs-in-render запрещены линтером проекта). Только когда !isDirty — иначе
  // фоновый рефетч (напр. после invalidateQueries в saveChanges) затрёт
  // несохранённые галочки черновика.
  const [syncedTogglesData, setSyncedTogglesData] = useState<typeof togglesQ.data>(undefined);
  if (togglesQ.data && togglesQ.data !== syncedTogglesData && !isDirty) {
    setSyncedTogglesData(togglesQ.data);
    const merged = mergeToggles(buildInitialToggles(), togglesQ.data);
    setToggles(merged);
    setSavedToggles(merged);
  }

  // Канал сохраняется сразу (оптимистично); при ошибке откатываем + тост.
  const toggleChannel = (key: ChannelKey) => {
    const next = !channels[key];
    if (next && INTEGRATION_CHANNELS.has(key) && !isIntegrationConnected(channelStatuses, key)) {
      onNeedsConnect?.(key);
      return;
    }
    setChannel(key, next);
    updateSettingsMut.mutate({ [key]: next }, {
      onError: (e: unknown) => {
        setChannel(key, !next);
        toast.error(errorMessage(e, t));
      },
      onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.notificationSettings }),
    });
  };

  const toggleCheck = (evId: string, chKey: ChannelKey) =>
    setToggles(prev => ({
      ...prev,
      [evId]: { ...prev[evId], [chKey]: !prev[evId][chKey] },
    }));

  const switchRole = (role: Role) => {
    if (role === activeRole) return;
    setActiveRole(role);
  };

  const saveChanges = () => {
    const changes = diffToggles(toggles, savedToggles);
    if (changes.length === 0) return;
    saveTogglesMut.mutate(changes, {
      onSuccess: () => {
        setSavedToggles(toggles);
        qc.invalidateQueries({ queryKey: queryKeys.notificationEventToggles });
        toast.success(t('common:actions.saved', 'Сохранено'));
      },
      onError: (e: unknown) => toast.error(errorMessage(e, t)),
    });
  };

  const cancelChanges = () => setToggles(savedToggles);

  const countActive = (role: Role) =>
    NOTIF_EVENTS[role].reduce((sum, ev) => {
      const hasActive = CHANNELS.some(ch => channels[ch.key] && toggles[ev.id]?.[ch.key]);
      return sum + (hasActive ? 1 : 0);
    }, 0);

  const currentRole = ROLES.find(r => r.key === activeRole)!;
  const events = NOTIF_EVENTS[activeRole];
  const activeChannels = CHANNELS.filter(c => channels[c.key]);

  return {
    channels, toggleChannel,
    activeRole, switchRole, countActive,
    currentRole, events, activeChannels,
    toggles, toggleCheck, setToggles,
    isDirty, saveChanges, cancelChanges,
    loading: settingsQ.isPending || togglesQ.isPending,
    saving: saveTogglesMut.isPending,
  };
}
