import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role, ChannelKey, MatrixEventRow } from '../../types';
import type { ChannelInfo } from '../../../../../api/notifications/notifications.types';
import { EVENT_META, DEFAULT_EVENT_META } from '../../constants';
import { Icon } from '../ui/NotificationIcons';
import MiniCheck from '../ui/MiniCheck';
import styles from '../../Notifications.module.css';

interface Props {
  currentRole: { key: Role; IconComp: () => JSX.Element; color: string; bg: string };
  events: MatrixEventRow[];
  allChannels: ChannelInfo[];
  toggleCheck: (evId: string, chKey: ChannelKey) => void;
  toggleAllForRole: () => void;
  allOn: boolean;
  syncing: boolean;
  saveFailed: boolean;
}

export default function NotificationMatrix({
  currentRole, events, allChannels, toggleCheck, toggleAllForRole, allOn, syncing, saveFailed,
}: Props) {
  const { t } = useTranslation('notifications');
  // allChannels уже отфильтрован в useNotifications (подключён + включён тумблером).
  const activeChannels = allChannels.filter(ch => CHANNEL_META[ch.key]);
  const activeCount = events.reduce((s, ev) => s + activeChannels.filter(ch => ev.channels[ch.key as ChannelKey]).length, 0);
  const totalCount = events.length * activeChannels.length;

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(var(--ink),0.08)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid rgba(var(--ink),0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: currentRole.bg, color: currentRole.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <currentRole.IconComp />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)' }}>
              {t('matrix.scenariosFor', { role: t(`roles.${currentRole.key}`) })}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              {t('matrix.configureFor', { count: events.length })}
            </div>
          </div>
        </div>
      </div>

      <div>
        {activeChannels.length > 0 && (
          <div className={styles.matrixHead} style={{
            display: 'grid', gridTemplateColumns: `1fr repeat(${activeChannels.length}, 44px)`,
            gap: '12px', padding: '16px 24px 8px', alignItems: 'center',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              {t('matrix.eventColumn')}
            </div>
            {activeChannels.map(ch => {
              const meta = CHANNEL_META[ch.key];
              return (
                <div key={ch.key} title={meta.label} style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${meta.color}15`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <meta.IconComp />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeChannels.length === 0 && (
          <div style={{ padding: '60px 24px', textAlign: 'center', background: 'var(--bg2)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(var(--ink),0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text3)' }}>
              <Icon.AlertTriangle />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '4px' }}>{t('matrix.noActiveChannels')}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('matrix.noActiveChannelsHint')}</div>
          </div>
        )}

        {activeChannels.length > 0 && events.map((ev, i) => {
          const meta = EVENT_META[ev.event_id] ?? DEFAULT_EVENT_META;
          return (
            <div key={ev.event_id} className={styles.notifRow} style={{
              display: 'grid', gridTemplateColumns: `1fr repeat(${activeChannels.length}, 44px)`,
              gap: '12px', padding: '14px 24px', alignItems: 'center',
              background: i % 2 === 1 ? 'rgba(var(--ink),0.01)' : 'transparent',
              borderBottom: i < events.length - 1 ? '1px solid rgba(var(--ink),0.04)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${meta.color}15`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <meta.icon />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)', marginBottom: '2px' }}>
                    {t(`events.${ev.event_id}.title`)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    {t(`events.${ev.event_id}.desc`)}
                  </div>
                </div>
              </div>
              {activeChannels.map(ch => {
                const chMeta = CHANNEL_META[ch.key];
                return (
                  <div key={ch.key} style={{ display: 'flex', justifyContent: 'center' }}>
                    {/* Иконка канала видна только на телефоне: там строка ломается
                        на два яруса и шапка таблицы с подписями колонок уходит,
                        а без неё галочка не сообщает, какой это канал. */}
                    <span className={styles.cellChannelIcon} style={{ color: chMeta.color }}>
                      <chMeta.IconComp />
                    </span>
                    <MiniCheck
                      on={ev.channels[ch.key as ChannelKey] ?? false}
                      onChange={() => toggleCheck(ev.event_id, ch.key as ChannelKey)}
                      color={chMeta.color}
                      title={chMeta.label}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {activeChannels.length > 0 && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(var(--ink),0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg2)' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
            {t('matrix.activeCount', { count: activeCount, total: totalCount })}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', fontWeight: 700,
              color: syncing ? 'var(--muted)' : saveFailed ? '#D88C9A' : '#A3C9A8',
            }}>
              {syncing ? (
                <>
                  <span style={{
                    width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                    border: '2px solid rgba(var(--ink),0.15)', borderTopColor: '#666666',
                    animation: 'vl-matrix-spin 0.6s linear infinite',
                  }} />
                  <style>{`@keyframes vl-matrix-spin { to { transform: rotate(360deg); } }`}</style>
                  {t('matrix.saving')}
                </>
              ) : saveFailed ? (
                <>
                  <Icon.AlertTriangle />
                  {t('matrix.notSaved')}
                </>
              ) : (
                <>
                  <Icon.Check />
                  {t('matrix.allSaved')}
                </>
              )}
            </span>

            <button
              onClick={toggleAllForRole}
              style={{ fontSize: '12px', fontWeight: 800, color: 'var(--onyx)', background: 'var(--bg-card)', border: '1px solid rgba(var(--ink),0.1)', cursor: 'pointer', padding: '8px 14px', borderRadius: '8px', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--onyx)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(var(--ink),0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {allOn ? t('matrix.deactivateAll') : t('matrix.activateAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const CHANNEL_META: Record<string, { label: string; color: string; IconComp: () => JSX.Element }> = {
  telegram: { label: 'Telegram', color: '#4A80C4', IconComp: Icon.Telegram },
  whatsapp: { label: 'WhatsApp', color: '#5BAB72', IconComp: Icon.WhatsApp },
  instagram: { label: 'Instagram', color: '#C13584', IconComp: Icon.Instagram },
  email: { label: 'Email', color: '#F9A08B', IconComp: Icon.Email },
};
