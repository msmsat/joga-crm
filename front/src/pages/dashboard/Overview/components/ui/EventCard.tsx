import { useTranslation } from 'react-i18next';
import type { RecentEvent } from '../../types';
import EventMenu from './EventMenu';
import { toRelative } from './relativeTime';

interface Props {
  event: RecentEvent;
}

export default function EventCard({ event }: Props) {
  const { t, i18n } = useTranslation('dashboard');

  return (
    <div
      className="activity-item"
      style={{
        margin: 0,
        background: 'var(--bg-card)',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid rgba(var(--ink),0.05)',
        boxShadow: '0 2px 8px rgba(26,26,26,0.04)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(var(--ink),0.08)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(26,26,26,0.04)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <div className="activity-dot" style={{ background: event.color }} />
      <div style={{ flex: 1 }}>
        <div className="activity-text" style={{ fontSize: '12px' }}>
          <strong>{event.actor_name}</strong> {event.title}
        </div>
        <div className="activity-time">{toRelative(event.created_at, i18n.language, t)}</div>
      </div>

      <EventMenu event={event} />
    </div>
  );
}
