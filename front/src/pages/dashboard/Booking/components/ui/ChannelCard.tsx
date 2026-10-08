import { useTranslation } from 'react-i18next'
import type { ChannelCardProps } from '../../types'

export function ChannelCard({ icon, name, desc, status, statusLabel, color, onClick }: ChannelCardProps) {
  const { t } = useTranslation('booking')
  return (
    <button type="button" className="channel-card channel-card-button" onClick={onClick} style={{ '--channel-color': color } as React.CSSProperties}>
      <div className="channel-icon-wrap" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="channel-name">{name}</div>
      <div className="channel-desc">{desc}</div>
      {status === 'connected' ? (
        <div className="channel-status connected">
          <span className="channel-status-dot"></span>{statusLabel ?? t('channels.connected')}
        </div>
      ) : status === 'pending' ? (
        <div className="channel-status pending">
          <span className="channel-status-dot"></span>{statusLabel ?? t('channels.pending')}
        </div>
      ) : (
        <div className="channel-status disconnected">{statusLabel ?? t('channels.disconnected')}</div>
      )}
    </button>
  )
}
