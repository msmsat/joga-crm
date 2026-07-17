import { useEffect, useState } from 'react'
import { bookingApi } from '../../../../api/booking/booking.api'
import type { BookingChannel, BookingChannelType } from '../../../../api/booking/booking.types'
import type { ChannelStatus } from '../types'

// Статусы каналов, у которых ещё нет строки на сервере — сохраняем прежний вид страницы.
const DEFAULT_STATUS: Record<BookingChannelType, ChannelStatus> = {
  telegram: null, instagram: 'connected', web: 'connected', whatsapp: 'pending',
}

export function useTgBot() {
  const [channels, setChannels] = useState<Record<string, BookingChannel>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    bookingApi.getChannels()
      .then(rows => { if (!cancelled) setChannels(Object.fromEntries(rows.map(r => [r.channel_type, r]))) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки') })
    return () => { cancelled = true }
  }, [])

  const statusOf = (type: BookingChannelType): ChannelStatus => {
    const ch = channels[type]
    if (!ch) return DEFAULT_STATUS[type]
    return ch.is_active ? 'connected' : null
  }

  const tg = channels['telegram']
  const token = (tg?.config?.token as string) ?? ''
  const connected = !!tg?.is_active
  const botName = token.split(':')[0] || 'velora_bot'

  async function connect(rawToken: string) {
    try {
      const row = await bookingApi.updateChannel('telegram', { is_active: true, config: { token: rawToken } })
      setChannels(prev => ({ ...prev, telegram: row }))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось подключить бота')
    }
  }

  async function disconnect() {
    try {
      const row = await bookingApi.updateChannel('telegram', { is_active: false })
      setChannels(prev => ({ ...prev, telegram: row }))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось отключить бота')
    }
  }

  return { connected, botName, token, connect, disconnect, statusOf, error }
}
