import { useTranslation } from 'react-i18next';
import styles from '../AIDrawer.module.css';
import type { AIChatSession } from '../types';
import { timeAgo } from '../../../lib/datetime';
import EmptyStateSVG from './EmptyStateSVG';

interface HistoryViewProps {
  sessions: AIChatSession[];
  sessionsLoading: boolean;
  sessionsError: boolean;
  onRetry: () => void;
  activeSessionId: number | null;
  onSelect: (id: number) => void;
}

export default function HistoryView({ sessions, sessionsLoading, sessionsError, onRetry, activeSessionId, onSelect }: HistoryViewProps) {
  const { t } = useTranslation('ai');

  if (sessionsError) {
    return (
      <div className={styles.errorState}>
        <span>{t('common:errors.loadFailed')}</span>
        <button onClick={onRetry} className={styles.retryBtn}>{t('common:errors.retry')}</button>
      </div>
    );
  }

  if (sessionsLoading) {
    return (
      <div className={styles.historyList}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.sessionSkelRow}>
            <div className={`${styles.skel} ${styles.sessionSkelTitle}`} />
            <div className={`${styles.skel} ${styles.sessionSkelPreview}`} />
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <EmptyStateSVG />
        <p className={styles.emptyTitle}>{t('history.empty')}</p>
      </div>
    );
  }

  return (
    <div className={styles.historyList}>
      {sessions.map(session => (
        <div
          key={session.id}
          className={`${styles.sessionItem} ${activeSessionId === session.id ? styles.sessionItemActive : ''}`}
          onClick={() => onSelect(session.id)}
        >
          <div className={styles.sessionTitle}>{session.title}</div>
          <div className={styles.sessionPreview}>{session.preview ?? ''}</div>
          <div className={styles.sessionMeta}>
            <span className={styles.sessionTime}>{timeAgo(session.updated_at)}</span>
            <span className={styles.sessionCount}>{t('history.messagesCount', { count: session.message_count })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
