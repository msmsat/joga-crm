import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ChannelKey, Role } from '../types';
import { ROLES } from '../constants';
import { optimisticToggle, mergeMatrixRow } from '../utils';
import { notificationsApi } from '../../../../api/notifications';
import { queryKeys } from '../../../../api/queryKeys';
import { useNotificationsStore } from '../../../../stores/notificationsStore';
import { useToast } from '../../../../components/ui/Toast';
import { errorMessage } from '../../../../api/errorMessage';
import type { EventToggle, MatrixRead, NotifyChannelsStatus } from '../../../../api/notifications/notifications.types';

// Отдельный хук: вызывается до useChannelIntegrations, чтобы её onConnected-колбэк
// (enableChannel) существовал раньше useNotifications, которому нужен статус интеграций.
export function useEnableChannel() {
  const setChannel = useNotificationsStore(s => s.setChannel);
  const qc = useQueryClient();
  // После подключения канала в модалке: интеграция уже сохранена на бэке,
  // здесь включаем сам тумблер настроек (PATCH + локальный стейт), без отката
  // при ошибке — подключение уже состоялось, тумблер лишь отражает его.
  // Инвалидация в finally подтягивает реальное состояние с сервера даже если
  // PATCH упал, и снимает расхождение локального стора с кэшем React Query.
  return (key: ChannelKey) => {
    setChannel(key, true);
    notificationsApi.updateSettings({ [key]: true })
      .catch(() => {})
      .finally(() => qc.invalidateQueries({ queryKey: queryKeys.notificationSettings }));
  };
}

export function useNotifications(channelStatuses?: NotifyChannelsStatus, onNeedsConnect?: (key: ChannelKey) => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { activeRole, setActiveRole, channels, setChannel, hydrateChannels } = useNotificationsStore();

  const settingsQ = useQuery({ queryKey: queryKeys.notificationSettings, queryFn: notificationsApi.getSettings });
  // EPIC 3 (ROADMAP_SETTINGS): единый источник правды за матрицу — каталог +
  // эффективное состояние + локи одним ответом (не считаем локи на фронте).
  const matrixQ = useQuery({ queryKey: queryKeys.notificationMatrix, queryFn: notificationsApi.getMatrix });

  const updateSettingsMut = useMutation({ mutationFn: notificationsApi.updateSettings });
  const bulkMut = useMutation({ mutationFn: notificationsApi.bulkUpdateEventToggles });

  // Гидратация локального стора чекбоксов сайдбара из GET /settings/notifications
  // (не трогаем матрицу — она держит собственное состояние в query-кэше).
  useEffect(() => {
    if (!settingsQ.data) return;
    const data = settingsQ.data;
    hydrateChannels({ telegram: data.telegram, whatsapp: data.whatsapp, email: data.email });
  }, [settingsQ.data, hydrateChannels]);

  // Канал сохраняется сразу (оптимистично); при ошибке откатываем + тост.
  const toggleChannel = (key: ChannelKey) => {
    const next = !channels[key];
    if (next && !isIntegrationConnected(channelStatuses, key)) {
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

  // Одна ячейка матрицы — optimistic-мутация с откатом (см. AppearanceTab.tsx: тот
  // же паттерн onMutate/onError/onSuccess). Локи пересчитывает бэк, не фронт —
  // ответ PATCH это строка матрицы целиком (mergeMatrixRow), а не голый тумблер.
  const toggleMut = useMutation({
    mutationFn: (v: EventToggle) => notificationsApi.updateEventToggle(v),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: queryKeys.notificationMatrix });
      const prev = qc.getQueryData<MatrixRead>(queryKeys.notificationMatrix);
      if (prev) qc.setQueryData<MatrixRead>(queryKeys.notificationMatrix, optimisticToggle(prev, v.event_id, v.channel_key as ChannelKey, v.is_enabled));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.notificationMatrix, ctx.prev);
      toast.error(errorMessage(e, t));
    },
    onSuccess: (row) => {
      qc.setQueryData<MatrixRead>(queryKeys.notificationMatrix, (old) => (old ? mergeMatrixRow(old, row) : old));
    },
  });

  const toggleCheck = (evId: string, chKey: ChannelKey) => {
    const row = matrixQ.data?.events.find(e => e.event_id === evId);
    if (!row || row.locked) return; // критичное — строка целиком нередактируема
    const nextValue = !row.channels[chKey];
    if (!nextValue && row.tier === 'operational' && row.locked_channels.includes(chKey)) return; // последний канал
    toggleMut.mutate({ role: row.role, event_id: evId, channel_key: chKey, is_enabled: nextValue });
  };

  const switchRole = (role: Role) => {
    if (role === activeRole) return;
    setActiveRole(role);
  };

  const allChannels = matrixQ.data?.channels ?? [];
  // Только подключённые каналы реально кликабельны в матрице (отключённые
  // рендерятся тире вместо чекбокса, см. MatrixCell) — bulk-действие трогает
  // ровно то, что пользователь может нажать сам.
  const connectedChannelKeys = allChannels.filter(c => c.connected).map(c => c.key as ChannelKey);

  const countActive = (role: Role) =>
    (matrixQ.data?.events ?? []).filter(r => r.role === role).reduce((sum, r) => {
      const hasActive = connectedChannelKeys.some(ch => r.channels[ch]);
      return sum + (hasActive ? 1 : 0);
    }, 0);

  const currentRole = ROLES.find(r => r.key === activeRole)!;
  const events = (matrixQ.data?.events ?? []).filter(r => r.role === activeRole);

  // Активировать/деактивировать всё в текущей роли — только по незалоченным,
  // подключённым ячейкам; для operational всегда оставляем минимум один
  // включённый канал (та же гарантия доставки, что и на бэке, см. notification_resolver.py).
  const toggleableCells = events.flatMap(r => (r.locked ? [] : connectedChannelKeys.map(ch => ({ row: r, ch }))));
  const allOn = toggleableCells.length > 0 && toggleableCells.every(({ row, ch }) => row.channels[ch]);

  const toggleAllForRole = () => {
    const targetOn = !allOn;
    const toggles: EventToggle[] = [];
    for (const row of events) {
      if (row.locked) continue;
      if (targetOn) {
        for (const ch of connectedChannelKeys) {
          if (!row.channels[ch]) toggles.push({ role: row.role, event_id: row.event_id, channel_key: ch, is_enabled: true });
        }
        continue;
      }
      const onChannels = connectedChannelKeys.filter(ch => row.channels[ch]);
      const keep = row.tier === 'operational' ? onChannels[0] : undefined;
      for (const ch of onChannels) {
        if (ch === keep) continue;
        toggles.push({ role: row.role, event_id: row.event_id, channel_key: ch, is_enabled: false });
      }
    }
    if (toggles.length === 0) return;
    bulkMut.mutate(toggles, {
      onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notificationMatrix }),
      onError: (e: unknown) => toast.error(errorMessage(e, t)),
    });
  };

  return {
    channels, toggleChannel,
    channelSaving: updateSettingsMut.isPending,
    activeRole, switchRole, countActive,
    currentRole, events, allChannels,
    toggleCheck, toggleAllForRole, allOn,
    syncing: toggleMut.isPending || bulkMut.isPending,
    onConnectChannel: onNeedsConnect,
    loading: settingsQ.isPending || matrixQ.isPending,
  };
}

function isIntegrationConnected(statuses: NotifyChannelsStatus | undefined, key: ChannelKey): boolean {
  if (!statuses) return false;
  if (key === 'telegram') return statuses.telegram.connected;
  if (key === 'email') return statuses.email.connected;
  if (key === 'whatsapp') return statuses.whatsapp.connected;
  return false;
}
