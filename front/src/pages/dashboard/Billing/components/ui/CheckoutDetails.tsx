import { LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CheckoutPreview } from '../../../../../api/billing/billing.types';
import { formatMoney } from '../../../../../lib/money';
import { planLabel } from '../../../../../lib/plan';
import styles from './CheckoutDetails.module.css';

export default function CheckoutDetails({ preview }: { preview: CheckoutPreview | null }) {
  const { t, i18n } = useTranslation('billing');
  const freeUntil = preview?.free_until
    ? new Date(preview.free_until).toLocaleDateString(i18n.language || 'en', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className={styles.details}>
      {preview?.tax_outcome === 'taxable' && (
        <div className={styles.tax}>
          <span>{t('payModal.taxLine', { rate: preview.tax_rate_percent })}</span>
          <strong>{formatMoney(preview.tax_amount / 100, preview.currency)}</strong>
        </div>
      )}
      {preview?.tax_outcome === 'reverse_charge' && <p className={styles.note}>{t('payModal.reverseCharge')}</p>}
      {preview?.tax_outcome === 'requires_review' && <p className={styles.notice} role="status">{t('payModal.taxReview')}</p>}
      {preview?.kind === 'switch' && preview.current_plan && (
        <p className={styles.notice}>{t('payModal.burnWarning', { plan: planLabel(preview.current_plan, t) })}</p>
      )}
      {preview && preview.free_days > 0 && freeUntil && (
        <p className={styles.note}>{t('payModal.freeUntil', { count: preview.free_days, date: freeUntil })}</p>
      )}
      {preview?.kind === 'renewal' && <p className={styles.note}>{t('payModal.renewNote')}</p>}
      <p className={styles.secure}><LockKeyhole size={12} aria-hidden="true" />{t('checkout.secureStripe')}</p>
    </div>
  );
}
