import { useTranslation } from 'react-i18next';
import styles from '../AI.module.css';

export default function ThinkingIndicator() {
  const { t } = useTranslation('ai');
  return (
    <div className={styles.thinkingPillWrap}>
      <div className={styles.thinkingPill}>
        <div className={styles.aiAvatarSm}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#F9A08B">
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
          </svg>
        </div>
        <span className={styles.thinkingPillText}>{t('chat.thinking')}</span>
        <div className={styles.thinkingDots}>
          <span className={styles.thinkDot} style={{ animationDelay: '0s' }} />
          <span className={styles.thinkDot} style={{ animationDelay: '0.18s' }} />
          <span className={styles.thinkDot} style={{ animationDelay: '0.36s' }} />
        </div>
      </div>
    </div>
  );
}
