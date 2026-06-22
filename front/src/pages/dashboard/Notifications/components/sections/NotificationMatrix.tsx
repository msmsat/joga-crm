import type { JSX, Dispatch, SetStateAction } from 'react';
import type { Role, ChannelKey, NotifEvent, Toggles } from '../../types';
import { Icon } from '../ui/NotificationIcons';
import MiniCheck from '../ui/MiniCheck';
import styles from '../../Notifications.module.css';

type Channel = { key: ChannelKey; label: string; sub: string; IconComp: () => JSX.Element; color: string };

interface Props {
  currentRole: { key: Role; label: string; IconComp: () => JSX.Element; color: string; bg: string };
  events: NotifEvent[];
  activeChannels: Channel[];
  toggles: Toggles;
  toggleCheck: (evId: string, chKey: ChannelKey) => void;
  setToggles: Dispatch<SetStateAction<Toggles>>;
  animating: boolean;
  animDir: 'left' | 'right';
}

export default function NotificationMatrix({
  currentRole, events, activeChannels, toggles, toggleCheck, setToggles, animating, animDir,
}: Props) {
  const allOn = events.every(ev => activeChannels.every(ch => toggles[ev.id]?.[ch.key]));

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(26,26,26,0.08)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid rgba(26,26,26,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: currentRole.bg, color: currentRole.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <currentRole.IconComp />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A' }}>
              Сценарии для: {currentRole.label}
            </div>
            <div style={{ fontSize: '12px', color: '#666666', marginTop: '2px' }}>
              Настройте каналы для {events.length} системных триггеров
            </div>
          </div>
        </div>
      </div>

      <div style={{
        opacity: animating ? 0 : 1,
        transform: animating ? `translateX(${animDir === 'right' ? '16px' : '-16px'})` : 'translateX(0)',
        transition: animating ? 'none' : 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {activeChannels.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: `1fr repeat(${activeChannels.length}, 44px)`,
            gap: '12px', padding: '16px 24px 8px', alignItems: 'center',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Событие системы
            </div>
            {activeChannels.map(ch => (
              <div key={ch.key} title={ch.label} style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${ch.color}15`, color: ch.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ch.IconComp />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeChannels.length === 0 && (
          <div style={{ padding: '60px 24px', textAlign: 'center', background: '#FAFAFA' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}>
              <Icon.AlertTriangle />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#1A1A1A', marginBottom: '4px' }}>Нет активных каналов</div>
            <div style={{ fontSize: '12px', color: '#666666' }}>Включите хотя бы один канал доставки в панели слева</div>
          </div>
        )}

        {activeChannels.length > 0 && events.map((ev, i) => (
          <div key={ev.id} className={styles.notifRow} style={{
            display: 'grid', gridTemplateColumns: `1fr repeat(${activeChannels.length}, 44px)`,
            gap: '12px', padding: '14px 24px', alignItems: 'center',
            background: i % 2 === 1 ? 'rgba(26,26,26,0.01)' : 'transparent',
            borderBottom: i < events.length - 1 ? '1px solid rgba(26,26,26,0.04)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${ev.color}15`, color: ev.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ev.icon />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>
                  {ev.title}
                </div>
                <div style={{ fontSize: '11px', color: '#666666' }}>
                  {ev.desc}
                </div>
              </div>
            </div>
            {activeChannels.map(ch => (
              <div key={ch.key} style={{ display: 'flex', justifyContent: 'center' }}>
                <MiniCheck
                  on={toggles[ev.id]?.[ch.key] ?? false}
                  onChange={() => toggleCheck(ev.id, ch.key)}
                  color={ch.color}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {activeChannels.length > 0 && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(26,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
          <span style={{ fontSize: '12px', color: '#666666', fontWeight: 600 }}>
            Активных триггеров: <strong style={{ color: '#1A1A1A', fontWeight: 800 }}>
              {events.reduce((s, ev) => s + activeChannels.filter(ch => toggles[ev.id]?.[ch.key]).length, 0)}
            </strong> из {events.length * activeChannels.length}
          </span>
          <button
            onClick={() => {
              setToggles(prev => {
                const next = { ...prev };
                events.forEach(ev => {
                  next[ev.id] = { ...prev[ev.id] };
                  activeChannels.forEach(ch => { next[ev.id][ch.key] = !allOn; });
                });
                return next;
              });
            }}
            style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.1)', cursor: 'pointer', padding: '8px 14px', borderRadius: '8px', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {allOn ? 'Снять все галочки' : 'Активировать всё'}
          </button>
        </div>
      )}
    </div>
  );
}
