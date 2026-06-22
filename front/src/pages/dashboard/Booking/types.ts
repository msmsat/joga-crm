import type React from 'react'

export type ChannelStatus = 'connected' | 'pending' | null

export interface ChannelCardProps {
  icon: React.ReactNode
  name: string
  desc: string
  status?: ChannelStatus
  color: string
  onClick(): void
}
