import { useTranslation } from 'react-i18next';
import styles from './PaidBadge.module.css';

export default function PaidBadge({ detail = false }: { detail?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.badge} ${detail ? styles.detail : ''}`}>
      <span className={styles.seal} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="m6.5 12 3.7 3.7 7.3-7.4" /></svg>
      </span>
      <span className={styles.copy}>
        <span className={styles.label}>{t('payment.sync.paid')}</span>
        {detail && <span className={styles.hint}>{t('payment.sync.confirmed')}</span>}
      </span>
      <svg className={styles.spark} viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 9.7 6.3 14.5 8l-4.8 1.7L8 14.5 6.3 9.7 1.5 8l4.8-1.7Z" /></svg>
    </div>
  );
}
