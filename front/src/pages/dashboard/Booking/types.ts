import type React from 'react'

/** pending — подключение начато, но канал ещё не готов работать (анкета Stripe
 *  не дозаполнена, приём выключен тумблером). Отдельно от null: действие
 *  владельца тут «продолжить», а не «начать». */
export type ChannelStatus = 'connected' | 'pending' | null

export interface ChannelCardProps {
  icon: React.ReactNode
  name: string
  desc: string
  status?: ChannelStatus
  color: string
  onClick(): void
}
