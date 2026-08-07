import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { bookingApi } from '../../../../api/booking/booking.api'
import type { BookingChannel, BookingChannelType } from '../../../../api/booking/booking.types'
import { queryKeys } from '../../../../api/queryKeys'
import { invalidateChannelGroup } from '../../../../api/channelGroup'
import { useToast } from '../../../../components/ui/Toast'
import { errorMessage } from '../../../../api/errorMessage'

/** Telegram-бот студии — единственный канал, который настраивается на этой
 *  странице. Instagram и WhatsApp подключаются в Уведомлениях (аккаунт студии
 *  там один на всю CRM), запись клиента идёт через мини-приложение. */
export function useChannels() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()

  const { data: rows = [], error } = useQuery({
    queryKey: queryKeys.bookingChannels,
    queryFn: () => bookingApi.getChannels(),
  })
  const channels = Object.fromEntries(rows.map(r => [r.channel_type, r])) as Record<string, BookingChannel>

  const tg = channels['telegram']
  const token = (tg?.config?.token as string) ?? ''
  const connected = !!tg?.is_active
  // bot_username кладёт общий сервис при подключении; id из токена — фолбэк для
  // строк, подключённых до перехода на живую проверку.
  const botName = (tg?.config?.bot_username as string) || token.split(':')[0] || 'velora_bot'

  const mutation = useMutation({
    mutationFn: ({ type, payload }: { type: BookingChannelType; payload: Partial<BookingChannel> }) =>
      bookingApi.updateChannel(type, payload),
    onSuccess: (_row, { payload }) => {
      // Тот же бот виден на страницах Velora AI и Уведомлений — освежаем все три.
      invalidateChannelGroup(qc)
      toast.success(payload.is_active ? 'Бот подключён' : 'Бот отключён')
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  })

  async function connect(rawToken: string) {
    try {
      await mutation.mutateAsync({ type: 'telegram', payload: { is_active: true, config: { token: rawToken } } })
    } catch {
      // тост уже показан в onError мутации
    }
  }

  async function disconnect() {
    try {
      await mutation.mutateAsync({ type: 'telegram', payload: { is_active: false } })
    } catch {
      // тост уже показан в onError мутации
    }
  }

  return { connected, botName, token, connect, disconnect, error }
}
