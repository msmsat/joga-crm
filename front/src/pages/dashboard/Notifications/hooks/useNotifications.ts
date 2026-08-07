import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ChannelKey, Role } from '../types';
import { ROLES } from '../constants';
import { optimisticToggle, mergeMatrixRow, waEnableBlocker } from '../utils';
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
  // здесь включаем сам тумблер настроек (PATCH + локальный стейт).
  // Откат при ошибке обязателен: у WhatsApp подключение номера и право включить
  // канал — разные вещи, и сразу после Embedded Signup PATCH законно отвечает
  // 409 (шаблоны на модерации, бизнес не верифицирован). Без отката тумблер
  // мигал бы «включено» до ответа рефетча — ровно та ложь, от которой уходим.
  return (key: ChannelKey) => {
    setChannel(key, true);
    notificationsApi.updateSettings({ [key]: true })
      .catch(() => setChannel(key, false))
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
    // Включение WhatsApp, пока Meta не сняла все три барьера, не даём даже
    // отправить: сайдбар такой тумблер уже блокирует, но состояние приходит из
    // кэша и могло устареть, а гонять пользователя через 409 ради ответа,
    // который у нас уже есть, незачем. Сам отказ бэкенд всё равно продублирует.
    if (next && key === 'whatsapp' && waEnableBlocker(channelStatuses?.whatsapp)) {
      toast.error(t('notifications:channels.waLockedHint'));
      return;
    }
    setChannel(key, next);
    // Включение WhatsApp бэкенд может отклонить (wa_payment_required и соседи):
    // без карты, верификации и одобренных шаблонов Meta не доставит ни одного
    // уведомления. Откат + тост здесь общие для всех каналов.
    updateSettingsMut.mutate({ [key]: next }, {
      onError: (e: unknown) => {
        setChannel(key, !next);
        toast.error(errorMessage(e, t));
      },
      onSettled: () => {
        qc.invalidateQueries({ queryKey: queryKeys.notificationSettings });
        // Гейт по дороге перепроверил карту у Meta и записал результат —
        // перечитываем статусы каналов, чтобы плашка «оплата не добавлена»
        // в сайдбаре появилась вместе с отказом.
        qc.invalidateQueries({ queryKey: queryKeys.notifyIntegrations });
      },
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

  // Локов в матрице нет: любая ячейка свободно переключается. Гарантия доставки
  // живёт не здесь, а в resolve_channels (критичное событие уходит по своим
  // default_channels, у операционного при пустом наборе срабатывает fallback) —
  // тумблер её не отменяет, поэтому запрещать клик незачем.
  const toggleCheck = (evId: string, chKey: ChannelKey) => {
    const row = matrixQ.data?.events.find(e => e.event_id === evId);
    if (!row) return;
    toggleMut.mutate({ role: row.role, event_id: evId, channel_key: chKey, is_enabled: !row.channels[chKey] });
  };

  const switchRole = (role: Role) => {
    if (role === activeRole) return;
    setActiveRole(role);
  };

  // Канал студии = подключён И включён тумблером в сайдбаре. Берём тумблер из
  // стора (а не global_enabled из /matrix): стор обновляется оптимистично,
  // колонка появляется/исчезает сразу, без рефетча матрицы. Список студийный,
  // ролью пока не сужен — countActive считает бейджи для всех 4 вкладок сразу
  // (RolesSelector), а не только текущей; r.channels[ch] сам вернёт undefined
  // для канала, которого нет у роли строки r (бэк отдаёт только применимые
  // ключи — ROLE_CHANNELS), так что лишние ключи здесь безопасны.
  const studioChannels = (matrixQ.data?.channels ?? []).filter(c => c.connected && channels[c.key as ChannelKey]);
  const connectedChannelKeys = studioChannels.map(c => c.key as ChannelKey);

  const countActive = (role: Role) =>
    (matrixQ.data?.events ?? []).filter(r => r.role === role).reduce((sum, r) => {
      const hasActive = connectedChannelKeys.some(ch => r.channels[ch]);
      return sum + (hasActive ? 1 : 0);
    }, 0);

  const currentRole = ROLES.find(r => r.key === activeRole)!;
  const events = (matrixQ.data?.events ?? []).filter(r => r.role === activeRole);

  // Каналы, применимые к ТЕКУЩЕЙ роли: персоналу telegram не доставить
  // структурно (ROLE_CHANNELS на бэке — открывать клиентское мини-приложение
  // тренеру/админу незачем), поэтому матрица не должна рисовать
  // по нему кликабельную, но нерабочую колонку. Источник — сами
  // строки: все строки одной роли делят один набор ключей channels (его
  // строит _matrix_row по ROLE_CHANNELS[role]).
  const roleChannelKeys = new Set(Object.keys(events[0]?.channels ?? {}));
  const allChannels = studioChannels.filter(c => roleChannelKeys.has(c.key));
  const roleConnectedChannelKeys = allChannels.map(c => c.key as ChannelKey);

  // Активировать/деактивировать всё в текущей роли — по применимым для неё
  // подключённым ячейкам: иначе «включить всё» пыталось бы включить Telegram
  // тренеру и падало бы на всю пачку (границу теперь держит и бэк — 422).
  const cells = events.flatMap(r => roleConnectedChannelKeys.map(ch => ({ row: r, ch })));
  const allOn = cells.length > 0 && cells.every(({ row, ch }) => row.channels[ch]);

  const toggleAllForRole = () => {
    const targetOn = !allOn;
    const toggles: EventToggle[] = cells
      .filter(({ row, ch }) => row.channels[ch] !== targetOn)
      .map(({ row, ch }) => ({ role: row.role, event_id: row.event_id, channel_key: ch, is_enabled: targetOn }));
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
    saveFailed: toggleMut.isError || bulkMut.isError,
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
