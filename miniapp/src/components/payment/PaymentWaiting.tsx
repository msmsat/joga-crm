import { useTranslation } from 'react-i18next';
import { dismissPaymentWaiting, syncCheckouts } from '../../lib/paymentSync';
import styles from './PaymentWaiting.module.css';

export default function PaymentWaiting({ busy, error }: { busy: boolean; error: boolean }) {
  const { t } = useTranslation();
  return (
    <aside className={styles.panel} aria-label={t('payment.sync.awaiting')}>
      <div className={styles.header}>
        <span className={styles.orbit} aria-hidden="true"><span /></span>
        <div className={styles.copy} role="status" aria-live="polite">
          <strong>{t('payment.sync.awaiting')}</strong>
          <p>{t(error ? 'payment.sync.unavailable' : 'payment.sync.verifying')}</p>
        </div>
        <button type="button" className={styles.close} onClick={dismissPaymentWaiting} aria-label={t('payment.sync.close')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
        </button>
      </div>
      <button type="button" className={styles.retry} disabled={busy} onClick={() => void syncCheckouts().catch(() => undefined)}>
        {t(busy ? 'payment.sync.checking' : 'payment.sync.check')}
      </button>
    </aside>
  );
}
