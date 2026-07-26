import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ChannelKey, EventToggle, Role, Toggles } from '../types';
import { CHANNELS, ROLES, NOTIF_EVENTS } from '../constants';
import { buildInitialToggles, mergeToggles, diffToggles, flattenEnabledToggles } from '../utils';
import { notificationsApi } from '../../../../api/notifications';
import { queryKeys } from '../../../../api/queryKeys';
import { useNotificationsStore } from '../../../../stores/notificationsStore';
import { useToast } from '../../../../components/ui/Toast';
import { errorMessage } from '../../../../api/errorMessage';
import type { NotifyChannelsStatus } from '../../../../api/notifications/notifications.types';

const INTEGRATION_CHANNELS = new Set<ChannelKey>(['telegram', 'email', 'whatsapp']);
const DEBOUNCE_MS = 600; // серия кликов (напр. «Активировать все») схлопывается в 1 запрос

function isIntegrationConnected(statuses: NotifyChannelsStatus | undefined, key: ChannelKey): boolean {
  if (!statuses) return false;
  if (key === 'telegram') return statuses.telegram.connected;
  if (key === 'email') return statuses.email.connected;
  if (key === 'whatsapp') return statuses.whatsapp.connected;
  return false;
}

// Канал «живой» (виден в матрице справа, считается активным), только если он
// включён в настройках И его интеграция не отключена. Disconnect на бэке гасит
// integration.is_connected, но не сам флаг канала в настройках — поэтому одного
// channels[key] мало: отключённый канал остаётся true и без этой проверки
// продолжал висеть в матрице, хотя в сайдбаре уже показывалась кнопка «Подключить».
// Пока статус интеграций не загружен (undefined) — не прячем (оптимистично, как и
// сайдбар), чтобы не мигало и чтобы ошибка загрузки статусов не опустошала матрицу.
function isChannelLive(
  statuses: NotifyChannelsStatus | undefined,
  channels: Record<ChannelKey, boolean>,
  key: ChannelKey,
): boolean {
  if (!channels[key]) return false;
  if (!INTEGRATION_CHANNELS.has(key)) return true;
  if (!statuses) return true;
  return isIntegrationConnected(statuses, key);
}

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
  const togglesQ = useQuery({ queryKey: queryKeys.notificationEventToggles, queryFn: notificationsApi.getEventToggles });

  const updateSettingsMut = useMutation({ mutationFn: notificationsApi.updateSettings });
  // Один bulk-PATCH на пачку изменений вместо Promise.all(map(...)) — было N
  // параллельных запросов/транзакций на одно действие пользователя (EPIC N-8, дефект B).
  const saveTogglesMut = useMutation({ mutationFn: notificationsApi.bulkUpdateEventToggles });

  const [toggles, setToggles] = useState<Toggles>(buildInitialToggles);
  const [savedToggles, setSavedToggles] = useState<Toggles>(buildInitialToggles);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!settingsQ.data) return;
    const data = settingsQ.data;
    hydrateChannels(
      Object.fromEntries(CHANNELS.map(ch => [ch.key, data[ch.key] ?? false])) as Record<ChannelKey, boolean>,
    );
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

  // Новая студия: сервер ещё не хранит ни одной строки матрицы, но UI уже
  // показывает дефолтные события (buildInitialToggles) как включённые —
  // это только фронтовый дефолт, isDirty здесь false (toggles === savedToggles),
  // поэтому обычное автосохранение никогда не срабатывает. Итог был найден при
  // сквозном прогоне N-5/4: notify() видел 0 строк в матрице и молча ничего
  // не отправлял, хотя чекбоксы выглядели включёнными. Досылаем дефолт как
  // реальное состояние сервера один раз — только если у студии вообще нет
  // сохранённых строк (не трогаем уже настроенные студии).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!togglesQ.isSuccess || togglesQ.data.length > 0 || seededRef.current) return;
    seededRef.current = true;
    const seed = flattenEnabledToggles(buildInitialToggles());
    if (seed.length === 0) return;
    saveTogglesMut.mutate(seed, {
      onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.notificationEventToggles }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglesQ.isSuccess, togglesQ.data]);

  // Автосохранение матрицы: через DEBOUNCE_MS после ПОСЛЕДНЕГО изменения шлём
  // накопленный diff одним bulk-запросом. Таймер перезапускается на каждое
  // изменение toggles — промежуточные клики в сеть не уходят (EPIC N-8, дефект A).
  useEffect(() => {
    const changes = diffToggles(toggles, savedToggles);
    if (changes.length === 0) return;

    const timer = setTimeout(() => {
      const snapshot = toggles; // фиксируем то, что реально отправляем — к моменту
      // ответа сервера toggles мог уехать дальше, closure над ним пометил бы
      // сохранённым то, что ещё не отправлялось.
      setSaveFailed(false); // новая попытка — снимаем индикатор прошлой ошибки
      saveTogglesMut.mutate(changes, {
        onSuccess: () => setSavedToggles(snapshot),
        onError: (e: unknown) => {
          setToggles(savedToggles); // откат черновика к последнему подтверждённому
          setSaveFailed(true);
          toast.error(errorMessage(e, t));
        },
        onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.notificationEventToggles }),
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer); // перезапуск таймера / очистка при unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggles, savedToggles]);

  // Ref с актуальным несохранённым диффом — обновляется в эффекте, а не в теле
  // рендера (прямая запись в ref во время рендера запрещена линтером проекта,
  // см. комментарий у syncedTogglesData выше).
  const pendingRef = useRef<EventToggle[]>([]);
  useEffect(() => {
    pendingRef.current = diffToggles(toggles, savedToggles);
  }, [toggles, savedToggles]);

  // Флаш при уходе со страницы: 600 мс дебаунса — окно, где можно успеть уйти
  // раньше, чем сработает автосохранение. unmount (переход внутри SPA) и
  // beforeunload (закрытие/обновление вкладки) шлют то же самое несохранённое
  // одним keepalive-запросом (см. patchKeepalive — почему не sendBeacon).
  useEffect(() => {
    const flush = () => {
      if (pendingRef.current.length === 0) return;
      notificationsApi.flushEventTogglesOnUnload(pendingRef.current);
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

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

  const countActive = (role: Role) =>
    NOTIF_EVENTS[role].reduce((sum, ev) => {
      const hasActive = CHANNELS.some(ch => isChannelLive(channelStatuses, channels, ch.key) && toggles[ev.id]?.[ch.key]);
      return sum + (hasActive ? 1 : 0);
    }, 0);

  const currentRole = ROLES.find(r => r.key === activeRole)!;
  const events = NOTIF_EVENTS[activeRole];
  const activeChannels = CHANNELS.filter(c => isChannelLive(channelStatuses, channels, c.key));

  return {
    channels, toggleChannel,
    channelSaving: updateSettingsMut.isPending,
    activeRole, switchRole, countActive,
    currentRole, events, activeChannels,
    toggles, toggleCheck, setToggles,
    isDirty, saveFailed,
    loading: settingsQ.isPending || togglesQ.isPending,
    saving: saveTogglesMut.isPending,
  };
}
