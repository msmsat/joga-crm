import { ChannelCard } from '../ui/ChannelCard'
import { IconTelegram, IconInstagram, IconWeb, IconWhatsApp } from '../ui/BookingIcons'
import type { ChannelStatus } from '../../types'

interface Props {
  tgStatus: ChannelStatus
  onOpenTg(): void
  onOpenInsta(): void
  onOpenWeb(): void
  onOpenWa(): void
}

export function BookingChannels({ tgStatus, onOpenTg, onOpenInsta, onOpenWeb, onOpenWa }: Props) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text2)' }}>
        Каналы подключения
      </div>
      <div className="channels-grid">
        <ChannelCard icon={<IconTelegram />}  name="Telegram-бот" desc="Автоматическая запись через бота"  status={tgStatus}    color="#4A80C4" onClick={onOpenTg} />
        <ChannelCard icon={<IconInstagram />} name="Instagram"     desc="Ссылка для bio и сторис"          status="connected"   color="#C96B9E" onClick={onOpenInsta} />
        <ChannelCard icon={<IconWeb />}       name="Веб-сайт"      desc="Виджет или отдельная страница"    status="connected"   color="#5BAB72" onClick={onOpenWeb} />
        <ChannelCard icon={<IconWhatsApp />}  name="WhatsApp"      desc="Запись через мессенджер"          status="pending"     color="#25D366" onClick={onOpenWa} />
      </div>
    </div>
  )
}
