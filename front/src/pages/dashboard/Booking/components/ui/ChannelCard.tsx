import { useTranslation } from 'react-i18next'
import type { ChannelCardProps } from '../../types'

export function ChannelCard({ icon, name, desc, status, color, onClick }: ChannelCardProps) {
  const { t } = useTranslation('booking')
  return (
    <div className="channel-card" onClick={onClick} style={{ '--channel-color': color } as React.CSSProperties}>
      <div className="channel-icon-wrap" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="channel-name">{name}</div>
      <div className="channel-desc">{desc}</div>
      {status === 'connected' ? (
        <div className="channel-status connected">
          <span className="channel-status-dot"></span>{t('channels.connected')}
        </div>
      ) : (
        <div className="channel-status disconnected">{t('channels.disconnected')}</div>
      )}
    </div>
  )
}
