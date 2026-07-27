import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../../../../components/ui/index';
import type { Role, ChannelKey, MatrixEventRow, NotificationTier } from '../../types';
import type { ChannelInfo } from '../../../../../api/notifications/notifications.types';
import { EVENT_META, DEFAULT_EVENT_META } from '../../constants';
import { Icon } from '../ui/NotificationIcons';
import MiniCheck from '../ui/MiniCheck';
import styles from '../../Notifications.module.css';

const TIER_ORDER: NotificationTier[] = ['critical', 'operational', 'optional'];

interface Props {
  currentRole: { key: Role; IconComp: () => JSX.Element; color: string; bg: string };
  events: MatrixEventRow[];
  allChannels: ChannelInfo[];
  toggleCheck: (evId: string, chKey: ChannelKey) => void;
  toggleAllForRole: () => void;
  allOn: boolean;
  syncing: boolean;
  onConnectChannel?: (key: ChannelKey) => void;
}

export default function NotificationMatrix({
  currentRole, events, allChannels, toggleCheck, toggleAllForRole, allOn, syncing, onConnectChannel,
}: Props) {
  const { t } = useTranslation('notifications');
  const activeCount = events.reduce((s, ev) => s + allChannels.filter(ch => ev.channels[ch.key]).length, 0);
  const totalCount = events.length * allChannels.length;
  const hasToggleableCells = events.some(ev => !ev.locked);

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(26,26,26,0.08)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid rgba(26,26,26,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: currentRole.bg, color: currentRole.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <currentRole.IconComp />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A' }}>
              {t('matrix.scenariosFor', { role: t(`roles.${currentRole.key}`) })}
            </div>
            <div style={{ fontSize: '12px', color: '#666666', marginTop: '2px' }}>
              {t('matrix.configureFor', { count: events.length })}
            </div>
          </div>
        </div>
      </div>

      <div>
        {allChannels.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: `1fr repeat(${allChannels.length}, 44px)`,
            gap: '12px', padding: '16px 24px 8px', alignItems: 'center',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              {t('matrix.eventColumn')}
            </div>
            {allChannels.map(ch => (
              <ChannelHeaderCell key={ch.key} channel={ch} onConnect={onConnectChannel} />
            ))}
          </div>
        )}

        {TIER_ORDER.map(tier => {
          const rows = events.filter(ev => ev.tier === tier);
          if (rows.length === 0) return null;
          return (
            <div key={tier}>
              <div style={{
                padding: '10px 24px', fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: tier === 'critical' ? '#D88C9A' : '#999999',
                background: 'rgba(26,26,26,0.015)', borderTop: '1px solid rgba(26,26,26,0.04)',
              }}>
                {t(`matrix.tiers.${tier}`)}
              </div>
              {rows.map((ev, i) => {
                const meta = EVENT_META[ev.event_id] ?? DEFAULT_EVENT_META;
                return (
                  <div key={ev.event_id} className={styles.notifRow} style={{
                    display: 'grid', gridTemplateColumns: `1fr repeat(${allChannels.length}, 44px)`,
                    gap: '12px', padding: '14px 24px', alignItems: 'center',
                    background: i % 2 === 1 ? 'rgba(26,26,26,0.01)' : 'transparent',
                    borderBottom: i < rows.length - 1 ? '1px solid rgba(26,26,26,0.04)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${meta.color}15`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <meta.icon />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>
                          {t(`events.${ev.event_id}.title`)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#666666' }}>
                          {t(`events.${ev.event_id}.desc`)}
                        </div>
                      </div>
                    </div>
                    {allChannels.map(ch => (
                      <MatrixCell key={ch.key} row={ev} channel={ch} onToggle={toggleCheck} t={t} />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {events.length > 0 && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(26,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
          <span style={{ fontSize: '12px', color: '#666666', fontWeight: 600 }}>
            {t('matrix.activeCount', { count: activeCount, total: totalCount })}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {syncing && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#666666' }}>
                <span style={{
                  width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                  border: '2px solid rgba(26,26,26,0.15)', borderTopColor: '#666666',
                  animation: 'vl-matrix-spin 0.6s linear infinite',
                }} />
                <style>{`@keyframes vl-matrix-spin { to { transform: rotate(360deg); } }`}</style>
                {t('matrix.saving')}
              </span>
            )}

            {hasToggleableCells && (
              <button
                onClick={toggleAllForRole}
                style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.1)', cursor: 'pointer', padding: '8px 14px', borderRadius: '8px', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {allOn ? t('matrix.deactivateAll') : t('matrix.activateAll')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelHeaderCell({ channel, onConnect }: { channel: ChannelInfo; onConnect?: (key: ChannelKey) => void }) {
  const { t } = useTranslation('notifications');
  const meta = CHANNEL_HEADER_META[channel.key];
  if (!meta) return <div />;
  if (!channel.connected) {
    return (
      <Tooltip label={t('matrix.channelDisconnected')} side="top">
        <button
          type="button"
          onClick={() => onConnect?.(channel.key as ChannelKey)}
          title={meta.label}
          style={{
            width: '28px', height: '28px', borderRadius: '8px', border: '1.5px dashed rgba(26,26,26,0.18)',
            background: 'transparent', color: '#B3B3B3', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', margin: '0 auto',
          }}
        >
          <meta.IconComp />
        </button>
      </Tooltip>
    );
  }
  return (
    <div title={meta.label} style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${meta.color}15`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <meta.IconComp />
      </div>
    </div>
  );
}

function MatrixCell({
  row, channel, onToggle, t,
}: {
  row: MatrixEventRow; channel: ChannelInfo; onToggle: (evId: string, chKey: ChannelKey) => void; t: (key: string) => string;
}) {
  const chKey = channel.key as ChannelKey;
  const on = row.channels[chKey] ?? false;

  if (!channel.connected) {
    return <div style={{ display: 'flex', justifyContent: 'center', color: '#D9D9D9', fontSize: '12px' }}>—</div>;
  }

  const lastChannelLocked = row.tier === 'operational' && row.locked_channels.includes(chKey);
  const locked = row.locked || lastChannelLocked;

  const cell = (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <MiniCheck on={on} onChange={() => onToggle(row.event_id, chKey)} disabled={locked} />
      {locked && (
        <span style={{
          position: 'absolute', top: '-4px', right: '4px', color: '#999999',
          background: '#FDFCFB', borderRadius: '50%', lineHeight: 0, padding: '1px',
        }}>
          <Icon.Lock />
        </span>
      )}
    </div>
  );

  if (!locked) return cell;
  return <Tooltip label={t(`matrix.lock.${row.locked ? 'critical' : 'lastChannel'}`)} side="top">{cell}</Tooltip>;
}

const CHANNEL_HEADER_META: Record<string, { label: string; color: string; IconComp: () => JSX.Element }> = {
  telegram: { label: 'Telegram', color: '#4A80C4', IconComp: Icon.Telegram },
  whatsapp: { label: 'WhatsApp', color: '#5BAB72', IconComp: Icon.WhatsApp },
  email: { label: 'Email', color: '#F9A08B', IconComp: Icon.Email },
};
