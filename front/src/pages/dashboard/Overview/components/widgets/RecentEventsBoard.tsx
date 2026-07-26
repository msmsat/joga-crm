import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RecentEvent } from '../../types';
import EventCard from '../ui/EventCard';
import styles from '../../Overview.module.css';

interface Props {
  events: RecentEvent[];
}

export default function RecentEventsBoard({ events }: Props) {
  const { t } = useTranslation('dashboard');
  return (
    <div className="card mb-20">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700 }}>{t('events.title')}</div>
        <Link
          to="/dashboard/journal"
          style={{ fontSize: '11px', fontWeight: 700, color: 'var(--peach)', textDecoration: 'none' }}
        >
          {t('events.seeAll')} →
        </Link>
      </div>

      <div className={styles.eventsGrid}>
        {events.map((ev) => (
          <EventCard key={ev.id} event={ev} />
        ))}
      </div>
    </div>
  );
}
