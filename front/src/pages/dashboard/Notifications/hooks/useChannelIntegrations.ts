import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../../../../api/notifications'
import { queryKeys } from '../../../../api/queryKeys'
import { useToast } from '../../../../components/ui/Toast'
import { errorMessage } from '../../../../api/errorMessage'
import { invalidateTelegramBotGroup } from '../../../../api/telegramBotGroup'
import { useTranslation } from 'react-i18next'
import type { WaConnectPayload } from '../../../../api/notifications/notifications.types'

export function useChannelIntegrations(onConnected?: (key: 'telegram' | 'whatsapp' | 'email') => void) {
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
      invalidateTelegramBotGroup(qc)
      onConnected?.('telegram')
      toast.success(t('common:actions.saved', 'Подключено'))
    },
    onError,
  })

  const disconnectTelegram = useMutation({
    mutationFn: () => notificationsApi.disconnectTelegram(),
    onSuccess: () => {
      invalidateAfterDisconnect()
      invalidateTelegramBotGroup(qc)
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
  }
}
