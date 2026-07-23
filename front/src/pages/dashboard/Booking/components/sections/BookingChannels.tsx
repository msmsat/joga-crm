import { useTranslation } from 'react-i18next'
import { ChannelCard } from '../ui/ChannelCard'
import { IconTelegram, IconInstagram, IconWeb, IconWhatsApp } from '../ui/BookingIcons'
import type { ChannelStatus } from '../../types'

interface Props {
  tgStatus: ChannelStatus
  instaStatus: ChannelStatus
  webStatus: ChannelStatus
  waStatus: ChannelStatus
  onOpenTg(): void
  onOpenInsta(): void
  onOpenWeb(): void
  onOpenWa(): void
}

export function BookingChannels({ tgStatus, instaStatus, webStatus, waStatus, onOpenTg, onOpenInsta, onOpenWeb, onOpenWa }: Props) {
  const { t } = useTranslation('booking')
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text2)' }}>
        {t('channels.sectionTitle')}
      </div>
      <div className="channels-grid">
        <ChannelCard icon={<IconTelegram />}  name={t('channels.telegram.name')}  desc={t('channels.telegram.desc')}  status={tgStatus}    color="#4A80C4" onClick={onOpenTg} />
        <ChannelCard icon={<IconInstagram />} name={t('channels.instagram.name')} desc={t('channels.instagram.desc')} status={instaStatus} color="#C96B9E" onClick={onOpenInsta} />
        <ChannelCard icon={<IconWeb />}       name={t('channels.web.name')}       desc={t('channels.web.desc')}       status={webStatus}   color="#5BAB72" onClick={onOpenWeb} />
        <ChannelCard icon={<IconWhatsApp />}  name={t('channels.whatsapp.name')}  desc={t('channels.whatsapp.desc')}  status={waStatus}    color="#25D366" onClick={onOpenWa} />
      </div>
    </div>
  )
}
