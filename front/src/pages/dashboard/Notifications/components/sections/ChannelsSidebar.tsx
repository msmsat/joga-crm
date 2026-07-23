import { useTranslation } from 'react-i18next';
import type { ChannelKey } from '../../types';
import { CHANNELS } from '../../constants';
import NotifIllustration from '../ui/NotifIllustration';
import ToggleSwitch from '../ui/ToggleSwitch';
import type { NotifyChannelsStatus } from '../../../../../api/notifications/notifications.types';

// Каналы, для которых в этом эпике есть реальное подключение (модалка).
// Instagram/SMS/Push подключаются в других разделах — клик по ним не открывает модалку.
const MODAL_KEY: Partial<Record<ChannelKey, 'tg' | 'email' | 'wa'>> = {
  telegram: 'tg', email: 'email', whatsapp: 'wa',
};

function isIntegrationConnected(statuses: NotifyChannelsStatus | undefined, key: ChannelKey): boolean | null {
  if (!statuses) return null;
  if (key === 'telegram') return statuses.telegram.connected;
  if (key === 'email') return statuses.email.connected;
  if (key === 'whatsapp') return statuses.whatsapp.connected;
  return null;
}

function integrationSub(statuses: NotifyChannelsStatus | undefined, key: ChannelKey, fallback: string): string {
  const details = key === 'telegram' ? statuses?.telegram.details
    : key === 'email' ? statuses?.email.details
    : key === 'whatsapp' ? statuses?.whatsapp.details
    : undefined;
  if (!details) return fallback;
  const value = key === 'telegram' ? (details.bot_username && `@${details.bot_username}`)
    : key === 'email' ? details.email
    : key === 'whatsapp' ? details.display_phone_number
    : undefined;
  return (value as string | undefined) || '—';
}

interface Props {
  channels: Record<ChannelKey, boolean>;
  toggleChannel: (key: ChannelKey) => void;
  channelStatuses?: NotifyChannelsStatus;
  onOpenModal: (modal: 'tg' | 'email' | 'wa') => void;
}

export default function ChannelsSidebar({ channels, toggleChannel, channelStatuses, onOpenModal }: Props) {
  const { t } = useTranslation('notifications');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <NotifIllustration />

      <div className="card" style={{ padding: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', color: '#999999', textTransform: 'uppercase', marginBottom: '16px' }}>
          {t('channels.title')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {CHANNELS.map(ch => {
            const modalKey = MODAL_KEY[ch.key];
            const requiresIntegration = modalKey !== undefined;
            const integrationConnected = isIntegrationConnected(channelStatuses, ch.key);
            const needsConnect = requiresIntegration && integrationConnected === false;
            const sub = requiresIntegration ? integrationSub(channelStatuses, ch.key, ch.sub) : ch.sub;

            const handleClick = () => {
              if (modalKey) onOpenModal(modalKey);
            };

            return (
              <div
                key={ch.key}
                onClick={requiresIntegration ? handleClick : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                  borderRadius: '12px', background: channels[ch.key] ? `${ch.color}0D` : 'transparent',
                  transition: 'background 0.2s', cursor: requiresIntegration ? 'pointer' : 'default',
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: channels[ch.key] ? `${ch.color}18` : 'rgba(26,26,26,0.04)',
                  color: channels[ch.key] ? ch.color : '#999999',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', flexShrink: 0,
                }}>
                  <ch.IconComp />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: channels[ch.key] ? '#1A1A1A' : '#999999' }}>
                    {ch.label}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sub}
                  </div>
                </div>
                {needsConnect ? (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onOpenModal(modalKey); }}
                    style={{
                      padding: '5px 10px', borderRadius: '8px', border: 'none',
                      background: 'rgba(26,26,26,0.06)', color: '#666666',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {t('channels.connect')}
                  </button>
                ) : (
                  <ToggleSwitch on={channels[ch.key]} onChange={() => toggleChannel(ch.key)} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(249,160,139,0.08)', border: '1px solid rgba(249,160,139,0.2)', fontSize: '12px', color: '#666666', lineHeight: 1.6 }}>
        <span style={{ color: '#F9A08B', fontWeight: 800 }}>{t('matrix.adviceLabel')}</span> {t('matrix.advice')}
      </div>
    </div>
  );
}
