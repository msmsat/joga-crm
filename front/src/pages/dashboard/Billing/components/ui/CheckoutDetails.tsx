import { LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CheckoutPreview } from '../../../../../api/billing/billing.types';
import { formatMoney } from '../../../../../lib/money';
import { planLabel } from '../../../../../lib/plan';
import styles from './CheckoutDetails.module.css';

export default function CheckoutDetails({ preview, pending = false }: { preview: CheckoutPreview | null; pending?: boolean }) {
  const { t, i18n } = useTranslation('billing');
  const accessUntil = preview?.access_until && Number.isFinite(Date.parse(preview.access_until))
    ? new Date(preview.access_until).toLocaleDateString(i18n.language || 'en', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className={styles.details}>
      {/* Пока расчёт едет — ТОЛЬКО место под строку налога и дату доступа, даже
          если сам расчёт уже здесь, а ждём каталог: заглушка и настоящие строки
          разом раздували панель на кадр. С концом ожидания строки встают на
          место заглушек, и панель не вырастает рывком. */}
      {pending ? (
        <>
          <div className={`${styles.tax} ${styles.skeleton}`} aria-hidden>&nbsp;</div>
          <p className={`${styles.note} ${styles.skeleton}`} aria-hidden>&nbsp;</p>
        </>
      ) : <Rows preview={preview} accessUntil={accessUntil} />}
      <p className={styles.note}>{t('checkout.noAutoRenewal')}</p>
      <p className={styles.secure}><LockKeyhole size={12} aria-hidden="true" />{t('checkout.secureStripe')}</p>
    </div>
  );
}

/** Строки, которые знает только расчёт: налог, переход, срок доступа. */
function Rows({ preview, accessUntil }: { preview: CheckoutPreview | null; accessUntil: string | null }) {
  const { t } = useTranslation('billing');
  return (
    <>
      {preview?.tax_outcome === 'taxable' && (
        <div className={styles.tax}>
          <span>{t(preview.tax_rate_percent != null ? 'payModal.taxLine' : 'checkout.tax', { rate: preview.tax_rate_percent })}</span>
          <strong>{formatMoney(preview.tax_amount / 100, preview.currency)}</strong>
        </div>
      )}
      {preview?.tax_outcome === 'reverse_charge' && <p className={styles.note}>{t('payModal.reverseCharge')}</p>}
      {preview?.tax_outcome === 'requires_review' && <p className={styles.note} role="status">{t('checkout.subtitle')}</p>}
      {preview?.kind === 'switch' && preview.current_plan && (
        <p className={styles.notice}>{t('payModal.burnWarning', { plan: planLabel(preview.current_plan, t) })}</p>
      )}
      {accessUntil && <p className={styles.note}>{t('checkout.accessUntil', { date: accessUntil })}</p>}
      {preview?.kind === 'renewal' && <p className={styles.note}>{t('payModal.renewNote')}</p>}
    </>
  );
}
