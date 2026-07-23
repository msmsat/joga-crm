import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { bookingApi } from '../../../../api/booking/booking.api'
import type { BookingChannel, BookingChannelType } from '../../../../api/booking/booking.types'
import { queryKeys } from '../../../../api/queryKeys'
import { useToast } from '../../../../components/ui/Toast'
import { errorMessage } from '../../../../api/errorMessage'
import type { ChannelStatus } from '../types'

export function useChannels() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()

  const { data: rows = [], error } = useQuery({
    queryKey: queryKeys.bookingChannels,
    queryFn: () => bookingApi.getChannels(),
  })
  const channels = Object.fromEntries(rows.map(r => [r.channel_type, r])) as Record<string, BookingChannel>

  const statusOf = (type: BookingChannelType): ChannelStatus => {
    if (type !== 'telegram') return 'connected'
    const ch = channels[type]
    return ch?.is_active ? 'connected' : null
  }

  const tg = channels['telegram']
  const token = (tg?.config?.token as string) ?? ''
  const connected = !!tg?.is_active
  const botName = token.split(':')[0] || 'velora_bot'

  const mutation = useMutation({
    mutationFn: ({ type, payload }: { type: BookingChannelType; payload: Partial<BookingChannel> }) =>
      bookingApi.updateChannel(type, payload),
    onSuccess: (_row, { payload }) => {
      qc.invalidateQueries({ queryKey: queryKeys.bookingChannels })
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

  return { connected, botName, token, connect, disconnect, statusOf, error }
}
