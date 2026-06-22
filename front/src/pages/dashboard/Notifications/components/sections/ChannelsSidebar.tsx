import type { ChannelKey } from '../../types';
import { CHANNELS } from '../../constants';
import NotifIllustration from '../ui/NotifIllustration';
import ToggleSwitch from '../ui/ToggleSwitch';

interface Props {
  channels: Record<ChannelKey, boolean>;
  toggleChannel: (key: ChannelKey) => void;
}

export default function ChannelsSidebar({ channels, toggleChannel }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <NotifIllustration />

      <div className="card" style={{ padding: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', color: '#999999', textTransform: 'uppercase', marginBottom: '16px' }}>
          Каналы доставки
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {CHANNELS.map(ch => (
            <div
              key={ch.key}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                borderRadius: '12px', background: channels[ch.key] ? `${ch.color}0D` : 'transparent',
                transition: 'background 0.2s', cursor: 'default',
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
                  {ch.sub}
                </div>
              </div>
              <ToggleSwitch on={channels[ch.key]} onChange={() => toggleChannel(ch.key)} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(249,160,139,0.08)', border: '1px solid rgba(249,160,139,0.2)', fontSize: '12px', color: '#666666', lineHeight: 1.6 }}>
        <span style={{ color: '#F9A08B', fontWeight: 800 }}>Совет:</span> Настройте отдельно для каждой роли, что и куда отправлять — Velora учтёт это автоматически.
      </div>
    </div>
  );
}
