import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { planLabel } from '../../../../../lib/plan';
import { formatMoney } from '../../../../../lib/money';
import { LEGAL_LINK_PROPS, PRIVACY_URL, TERMS_URL } from '../../../../../utils/legal';
import type { CheckoutPreview, Plan } from '../../../../../api/billing/billing.types';
import AnimatedPayButton from '../ui/AnimatedPayButton';
import type { PaymentUi } from './StripePayment';
import styles from './CheckoutPage.module.css';

export default function CheckoutSummary({ plan, period, preview, payment, error, currency }: {
  plan: Plan; period: number; preview: CheckoutPreview | undefined;
  payment?: PaymentUi; error: string; currency: string;
}) {
  const { t, i18n } = useTranslation('billing');
  const money = (amount: number) => formatMoney(amount / 100, currency);
  const taxKnown = payment?.tax != null || (preview && preview.tax_outcome !== 'stripe_auto' && preview.tax_outcome !== 'requires_review');
  const tax = payment?.tax ?? preview?.tax_amount ?? 0;
  const total = payment?.total ?? (taxKnown ? preview?.total_with_tax : preview?.total);
  const deferred = !!preview?.free_until;
  return <aside className={styles.summary} aria-label={t('checkout.orderDetails')}>
    <div className={styles.summaryHeading}>
      <span className={styles.wordmark}>velora<span>.</span></span>
      <h2>{planLabel(plan.id, t)}</h2>
      <p>{t('checkout.months', { count: period })}</p>
    </div>
    <div className={styles.receipt}>
      <h3>{t('checkout.orderDetails')}</h3>
      <div className={styles.receiptRow}><div><strong>{t('checkout.subscription')}</strong><span>{t('checkout.months', { count: period })}</span></div>
        <strong>{preview ? money(preview.total) : '—'}</strong></div>
      <div className={styles.receiptRule} />
      <div className={styles.receiptRow}><span>{t('checkout.tax')}</span><span>{taxKnown ? money(tax) : t('checkout.taxAtPayment')}</span></div>
      {preview?.tax_outcome === 'reverse_charge' && <p className={styles.hint}>{t('checkout.reverseCharge')}</p>}
      <div className={styles.total}><span>{t(deferred ? 'checkout.dueToday' : 'checkout.total')}</span>
        <strong>{total != null ? money(deferred && !payment ? 0 : total) : '—'}</strong></div>
    </div>
    {deferred && <p className={styles.deferred}>{t('checkout.nextCharge', {
      amount: preview ? money(preview.total_with_tax) : '—',
      date: new Date(preview!.free_until!).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }),
    })}</p>}
    {preview?.kind === 'switch' && <p className={styles.warning}>{t('checkout.switchWarning')}</p>}
    <div className={styles.payArea}>
      <AnimatedPayButton onClick={payment?.submit ?? (() => {})} loading={payment?.busy}
        disabled={!payment?.ready || preview?.tax_outcome === 'requires_review'}>
        {t(deferred ? 'checkout.confirmSubscription' : 'checkout.pay', { amount: total != null ? money(total) : '' })}
      </AnimatedPayButton>
    </div>
    {(error || payment?.error) && <p className={styles.error} role="alert">{error || payment?.error}</p>}
    <p className={styles.secure}><ShieldCheck size={15} />{t('checkout.secure')}</p>
    <p className={styles.legal}>{t('checkout.agreement')} <a href={TERMS_URL} {...LEGAL_LINK_PROPS}>{t('legal.terms')}</a>
      {' · '}<a href={PRIVACY_URL} {...LEGAL_LINK_PROPS}>{t('legal.privacy')}</a></p>
  </aside>;
}
