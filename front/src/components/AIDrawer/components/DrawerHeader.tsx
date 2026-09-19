import { useTranslation } from 'react-i18next';
import styles from '../AIDrawer.module.css';

interface DrawerHeaderProps {
  showHistory: boolean;
  onHistoryToggle: () => void;
  onNewChat: () => void;
  onClose: () => void;
}

export default function DrawerHeader({ showHistory, onHistoryToggle, onNewChat, onClose }: DrawerHeaderProps) {
  const { t } = useTranslation('ai');
  return (
    <div className={styles.header}>
      {showHistory ? (
        <>
          <button className={styles.backBtn} onClick={onHistoryToggle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('drawer.historyBack')}
          </button>
          <span className={styles.headerTitle} style={{ opacity: 0.5, fontSize: '13px' }}>{t('drawer.historyLabel')}</span>
        </>
      ) : (
        <>
          <button
            onClick={onHistoryToggle}
            className={`${styles.historyBtn} ${showHistory ? styles.historyBtnActive : ''}`}
            title={showHistory ? 'Вернуться к чату' : 'История чатов'}
          >
            <div className={styles.historyBtnIcon}>
              {showHistory ? (
                /* Иконка стрелки "Назад" с мягким фильтром свечения */
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
              ) : (
                /* Футуристичная анимированная иконка Часов с орбитальными точками */
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15.5 14" />
                  <path d="M12 3v-1" strokeWidth="2.5" />
                  <path d="M12 22v-1" strokeWidth="2.5" />
                </svg>
              )}
            </div>
          </button>
          <span className={styles.headerTitle}>Velora AI</span>
          <div className={styles.headerActions}>
            <button className={styles.newChatBtn} onClick={onNewChat}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('actions.newChat')}
            </button>
          </div>
        </>
      )}

      <button className={styles.closeBtn} onClick={onClose} title={t('common:buttons.close')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
