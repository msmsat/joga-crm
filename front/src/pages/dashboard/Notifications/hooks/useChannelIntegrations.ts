import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../../../../api/notifications'
import { queryKeys } from '../../../../api/queryKeys'
import { useToast } from '../../../../components/ui/Toast'
import { errorMessage } from '../../../../api/errorMessage'
import { invalidateChannelGroup } from '../../../../api/channelGroup'
import { useTranslation } from 'react-i18next'
import type { NotifyChannelsStatus } from '../../../../api/notifications/notifications.types'

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

  // WhatsApp — Embedded Signup, как Instagram: уходим в мастер Meta полным
  // редиректом и возвращаемся сюда с ?wa=... Кэш здесь не трогаем — страница
  // всё равно перезагрузится после возврата.
  const connectWhatsApp = useMutation({
    mutationFn: () => notificationsApi.getWhatsappOauthUrl(),
    onSuccess: ({ url }) => { window.location.href = url },
    onError,
  })

  // Карту добавляют в Meta Business Manager, нам об этом никто не сообщает —
  // перепроверяем по требованию (открытие модалки, включение тумблера).
  // Тост только на ПЕРЕХОД «не было -> появилась»: проверка идёт при каждом
  // открытии модалки, и поздравлять с оплатой каждый раз незачем.
  const checkWaPayment = useMutation({
    mutationFn: () => notificationsApi.checkWaPayment(),
    onSuccess: (status) => {
      const was = qc.getQueryData<NotifyChannelsStatus>(queryKeys.notifyIntegrations)
        ?.whatsapp?.details?.payment_connected
      qc.setQueryData<NotifyChannelsStatus>(queryKeys.notifyIntegrations, (old) =>
        old ? { ...old, whatsapp: status } : old,
      )
      if (status.details?.payment_connected === true && was !== true) {
        toast.success(t('notifications:wa.paymentFound', 'Оплата подключена'))
      }
    },
    onError,
  })

  // Шаблоны заводятся сами при подключении номера (services/whatsapp.py::
  // sync_templates_on_connect) — кнопка осталась как ремонтная: перезавести,
  // если автосинхронизация не прошла. invalidate — ради свежего вердикта
  // модерации в модалке, бэкенд перечитывает статусы в том же запросе.
  const syncWaTemplates = useMutation({
    mutationFn: () => notificationsApi.syncWaTemplates(),
    onSuccess: (r) => {
      invalidate();
      if (r.failed > 0) {
        toast.error(t('notifications:wa.templatesPartial', { failed: r.failed }))
      } else {
        toast.success(t('notifications:wa.templatesDone', { count: r.created + r.exists }))
      }
    },
    onError,
  })

  const disconnectWhatsApp = useMutation({
    mutationFn: () => notificationsApi.disconnectWhatsApp(),
    onSuccess: () => {
      invalidateAfterDisconnect()
      invalidateChannelGroup(qc)
      toast.success(t('common:actions.saved', 'Отключено'))
    },
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
    checkWaPayment,
    syncWaTemplates,
    connectInstagram,
    disconnectInstagram,
  }
}
