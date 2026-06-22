import { Link } from 'react-router-dom';
import type { RecentEvent } from '../../types';
import EventCard from '../ui/EventCard';
import styles from '../../Overview.module.css';

interface Props {
  events: RecentEvent[];
}

export default function RecentEventsBoard({ events }: Props) {
  return (
    <div className="card mb-20">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700 }}>Последние события</div>
        <Link
          to="/dashboard/journal"
          style={{ fontSize: '11px', fontWeight: 700, color: 'var(--peach)', textDecoration: 'none' }}
        >
          Смотреть все →
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
