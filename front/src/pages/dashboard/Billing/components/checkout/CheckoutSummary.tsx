import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { planSeats } from '../../../../../lib/plan';
import { formatMoney } from '../../../../../lib/money';
import { LEGAL_LINK_PROPS, PRIVACY_URL, TERMS_URL } from '../../../../../utils/legal';
import type { CheckoutPreview, Plan } from '../../../../../api/billing/billing.types';
import AnimatedPayButton from '../ui/AnimatedPayButton';
import type { PaymentUi } from './StripePayment';
import CheckoutArtwork from './CheckoutArtwork';
import styles from './CheckoutPage.module.css';

export default function CheckoutSummary({ plan, period, preview, payment, error, currency, preparing, canPrepare, onPrepare, onBack }: {
  plan: Plan; period: number; preview: CheckoutPreview | undefined; payment?: PaymentUi;
  error: string; currency: string; preparing: boolean; canPrepare: boolean; onPrepare: () => void; onBack: () => void;
}) {
  const { t, i18n } = useTranslation('billing');
  const [expanded, setExpanded] = useState(false);
  const money = (amount: number) => formatMoney(amount / 100, currency);
  const taxKnown = payment?.tax != null || (preview && preview.tax_outcome !== 'stripe_auto' && preview.tax_outcome !== 'requires_review');
  const tax = payment?.tax ?? preview?.tax_amount ?? 0;
  const total = payment?.total ?? (taxKnown ? preview?.total_with_tax : preview?.total);
  const deferred = !!preview?.free_until;
  const displayedTotal = total != null ? money(deferred && !payment ? 0 : total) : '—';
  const totalLabel = t(deferred ? 'checkout.dueToday' : taxKnown ? 'checkout.total' : 'checkout.totalBeforeTax');
  const seats = planSeats(plan.id);
  const planName = seats === null ? t('checkout.unlimited') : seats === 1 ? t('checkout.solo') : t('checkout.members', { count: seats });
  return <aside className={styles.summary} aria-label={t('checkout.orderDetails')} data-expanded={expanded || undefined}>
    <div className={styles.summaryHeading}>
      <CheckoutArtwork />
      <div className={styles.selectedPlan}><span className={styles.planMiniMark}><img src="/favicon.svg" alt="" /></span>
        <div><span className={styles.planCaption}>{t('checkout.selectedPlan')}</span><h2>{planName}</h2>
          <p>{t('checkout.months', { count: period })}</p></div>
        <button type="button" className={styles.textButton} onClick={onBack} disabled={preparing || payment?.busy}>{t('checkout.changePlan')}</button>
      </div>
    </div>
    <div className={styles.summaryDetails}>
      <button className={styles.orderToggle} type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {t('checkout.orderDetails')}<ChevronDown size={14} /></button>
      <div className={styles.receipt}>
        <div className={styles.receiptRow}><span>{t('checkout.subscription')}</span><strong>{preview ? money(preview.total) : '—'}</strong></div>
        <div className={styles.receiptRow}><span>{t('checkout.tax')}</span><span>{taxKnown ? money(tax) : t('checkout.taxAtPayment')}</span></div>
        {preview?.tax_outcome === 'reverse_charge' && <p className={styles.hint}>{t('checkout.reverseCharge')}</p>}
        <div className={styles.total}><span>{totalLabel}</span><strong>{displayedTotal}</strong></div>
      </div>
      {deferred && <p className={styles.deferred}>{t('checkout.nextCharge', {
        amount: preview ? money(preview.total_with_tax) : '—',
        date: new Date(preview!.free_until!).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }),
      })}</p>}
      {preview?.kind === 'switch' && <p className={styles.warning}>{t('checkout.switchWarning')}</p>}
    </div>
    <div className={styles.summaryFooter}>
      {(error || payment?.error) && <p className={styles.error} role="alert">{error || payment?.error}</p>}
      <div className={styles.mobileTotal}><span>{totalLabel}</span><strong>{displayedTotal}</strong></div>
      <div className={styles.payArea}><AnimatedPayButton onClick={payment?.submit ?? onPrepare}
        loading={preparing || payment?.busy} disabled={payment ? !payment.ready || preview?.tax_outcome === 'requires_review' : !canPrepare}>
        {t(preparing ? 'checkout.preparing' : !payment ? 'checkout.continue' : deferred ? 'checkout.confirmSubscription' : 'checkout.pay', { amount: total != null ? money(total) : '' })}
      </AnimatedPayButton></div>
      <p className={styles.secure}><ShieldCheck size={13} />{t('checkout.secure')}</p>
    </div>
    <p className={styles.legal}>{t('checkout.agreement')} <a href={TERMS_URL} {...LEGAL_LINK_PROPS}>{t('legal.terms')}</a>
      {' · '}<a href={PRIVACY_URL} {...LEGAL_LINK_PROPS}>{t('legal.privacy')}</a></p>
  </aside>;
}
