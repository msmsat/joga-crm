import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../../../../api/notifications'
import { queryKeys } from '../../../../api/queryKeys'
import { useToast } from '../../../../components/ui/Toast'
import { errorMessage } from '../../../../api/errorMessage'
import { invalidateChannelGroup } from '../../../../api/channelGroup'
import { useTranslation } from 'react-i18next'
import type { WaConnectPayload } from '../../../../api/notifications/notifications.types'

export function useChannelIntegrations(onConnected?: (key: 'telegram' | 'whatsapp' | 'instagram' | 'email') => void) {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()

  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.notifyIntegrations,
    queryFn: notificationsApi.getChannelIntegrations,
  })

  // + queryKeys.integrations (эпик 6): та же StudioIntegration-строка видна и
  // на вкладке Настройки → Интеграции — без этого она отстаёт до ручного F5.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.notifyIntegrations })
    qc.invalidateQueries({ queryKey: queryKeys.integrations })
  }
  // Отключение интеграции гасит и тумблер канала в настройках — без этого
  // сайдбар после disconnect показывает канал включённым до ручного рефреша.
  const invalidateAfterDisconnect = () => {
    qc.invalidateQueries({ queryKey: queryKeys.notifyIntegrations })
    qc.invalidateQueries({ queryKey: queryKeys.notificationSettings })
    qc.invalidateQueries({ queryKey: queryKeys.integrations })
  }

  const onError = (err: unknown) => toast.error(errorMessage(err, t))

  // Telegram-бот один на три страницы — освежаем всю группу, иначе Velora AI и
  // Онлайн-запись останутся с прежним статусом до ручного рефреша.
  const connectTelegram = useMutation({
    mutationFn: (token: string) => notificationsApi.connectTelegram(token),
    onSuccess: () => {
      invalidateChannelGroup(qc)
      onConnected?.('telegram')
      toast.success(t('common:actions.saved', 'Подключено'))
    },
    onError,
  })

  const disconnectTelegram = useMutation({
    mutationFn: () => notificationsApi.disconnectTelegram(),
    onSuccess: () => {
      invalidateAfterDisconnect()
      invalidateChannelGroup(qc)
      toast.success(t('common:actions.saved', 'Отключено'))
    },
    onError,
  })

  const requestEmailCode = useMutation({
    mutationFn: (email: string) => notificationsApi.requestEmailCode(email),
    onSuccess: () => { invalidate(); toast.success(t('common:actions.saved', 'Код отправлен')) },
    onError,
  })

  const verifyEmailCode = useMutation({
    mutationFn: (code: string) => notificationsApi.verifyEmailCode(code),
    onSuccess: () => { invalidate(); onConnected?.('email'); toast.success(t('common:actions.saved', 'Подключено')) },
    onError,
  })

  const connectWhatsApp = useMutation({
    mutationFn: (payload: WaConnectPayload) => notificationsApi.connectWhatsApp(payload),
    onSuccess: () => { invalidate(); onConnected?.('whatsapp'); toast.success(t('common:actions.saved', 'Подключено')) },
    onError,
  })

  const disconnectWhatsApp = useMutation({
    mutationFn: () => notificationsApi.disconnectWhatsApp(),
    onSuccess: () => { invalidateAfterDisconnect(); toast.success(t('common:actions.saved', 'Отключено')) },
    onError,
  })

  // Instagram — только OAuth: уходим на страницу согласия Instagram полным
  // редиректом (не попап, как и на Velora AI), возвращаемся сюда с ?ig=...
  // Кэш здесь не трогаем — страница всё равно перезагрузится после возврата.
  const connectInstagram = useMutation({
    mutationFn: () => notificationsApi.getInstagramOauthUrl(),
    onSuccess: ({ url }) => { window.location.href = url },
    onError,
  })

  const disconnectInstagram = useMutation({
    mutationFn: () => notificationsApi.disconnectInstagram(),
    onSuccess: () => {
      invalidateAfterDisconnect()
      invalidateChannelGroup(qc)
      toast.success(t('common:actions.saved', 'Отключено'))
    },
    onError,
  })

  return {
    channels: data,
    loading: isPending,
    loadError: isError,
    connectTelegram,
    disconnectTelegram,
    requestEmailCode,
    verifyEmailCode,
    connectWhatsApp,
    disconnectWhatsApp,
    connectInstagram,
    disconnectInstagram,
  }
}
