import styles from '../AIDrawer.module.css';

interface DrawerHeaderProps {
  showHistory: boolean;
  onHistoryToggle: () => void;
  onNewChat: () => void;
  onClose: () => void;
}

export default function DrawerHeader({ showHistory, onHistoryToggle, onNewChat, onClose }: DrawerHeaderProps) {
  return (
    <div className={styles.header}>
      {showHistory ? (
        <>
          <button className={styles.backBtn} onClick={onHistoryToggle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Чаты
          </button>
          <span className={styles.headerTitle} style={{ opacity: 0.5, fontSize: '13px' }}>История</span>
        </>
      ) : (
        <>
          <button className={styles.historyBtn} onClick={onHistoryToggle} title="История чатов">
            <svg
              className={styles.historyBtnIcon}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-4.27" />
            </svg>
          </button>
          <span className={styles.headerTitle}>Velora AI</span>
          <div className={styles.headerActions}>
            <button className={styles.newChatBtn} onClick={onNewChat}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Новый чат
            </button>
          </div>
        </>
      )}

      <button className={styles.closeBtn} onClick={onClose} title="Закрыть">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
