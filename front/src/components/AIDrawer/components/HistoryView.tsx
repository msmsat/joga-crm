import styles from '../AIDrawer.module.css';
import type { DrawerSession } from '../types';

interface HistoryViewProps {
  sessions: DrawerSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
}

function formatRelativeTime(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн назад`;
}

export default function HistoryView({ sessions, activeSessionId, onSelect }: HistoryViewProps) {
  return (
    <div className={styles.historyList}>
      {sessions.map(session => (
        <div
          key={session.id}
          className={`${styles.sessionItem} ${activeSessionId === session.id ? styles.sessionItemActive : ''}`}
          onClick={() => onSelect(session.id)}
        >
          <div className={styles.sessionTitle}>{session.title}</div>
          <div className={styles.sessionPreview}>{session.preview}</div>
          <div className={styles.sessionMeta}>
            <span className={styles.sessionTime}>{formatRelativeTime(session.timestamp)}</span>
            <span className={styles.sessionCount}>{session.messageCount} сооб.</span>
          </div>
        </div>
      ))}
    </div>
  );
}
