import { useTranslation } from 'react-i18next'
import { ChannelCard } from '../ui/ChannelCard'
import { MiniappCard } from '../ui/MiniappCard'
import { IconTelegram, IconPayments } from '../ui/BookingIcons'
import type { ChannelStatus } from '../../types'

interface Props {
  tgStatus: ChannelStatus
  stripeStatus: ChannelStatus
  miniappUrl: string
  onOpenTg(): void
  onOpenStripe(): void
}

export function BookingChannels({ tgStatus, stripeStatus, miniappUrl, onOpenTg, onOpenStripe }: Props) {
  const { t } = useTranslation('booking')
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text2)' }}>
        {t('channels.sectionTitle')}
      </div>
      <div className="channels-grid">
        <ChannelCard icon={<IconTelegram />} name={t('channels.telegram.name')} desc={t('channels.telegram.desc')} status={tgStatus}     color="#4A80C4" onClick={onOpenTg} />
        <ChannelCard icon={<IconPayments />} name={t('channels.stripe.name')}   desc={t('channels.stripe.desc')}   status={stripeStatus} color="#F9A08B" onClick={onOpenStripe} />
        <MiniappCard url={miniappUrl} />
      </div>
    </div>
  )
}
