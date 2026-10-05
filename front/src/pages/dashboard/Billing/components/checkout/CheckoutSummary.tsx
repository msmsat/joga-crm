import { useState, type RefCallback } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { planSeats } from '../../../../../lib/plan';
import { formatMoney } from '../../../../../lib/money';
import { LEGAL_LINK_PROPS, PRIVACY_URL, TERMS_URL } from '../../../../../utils/legal';
import type { CheckoutPreview, Plan } from '../../../../../api/billing/billing.types';
import AnimatedPayButton from '../ui/AnimatedPayButton';
import type { PaymentUi } from './StripePayment';
import { checkoutAmounts } from './checkoutAmounts';
import CheckoutArtwork from './CheckoutArtwork';
import FirstPaymentPromo from '../ui/FirstPaymentPromo';
import styles from './CheckoutPage.module.css';

export default function CheckoutSummary({ plan, period, preview, payment, error, currency, preparing, canPrepare, onPrepare, onBack, taxPending = false, footerRef }: {
  footerRef?: RefCallback<HTMLDivElement>;
  plan: Plan; period: number; preview: CheckoutPreview | undefined; payment?: PaymentUi;
  taxPending?: boolean; error: string; currency: string; preparing: boolean; canPrepare: boolean; onPrepare: () => void; onBack: () => void;
}) {
  const { t, i18n } = useTranslation('billing');
  // Открыто сразу: на шаге оплаты человек должен видеть, за что платит, без лишнего нажатия.
  const [expanded, setExpanded] = useState(true);
  const money = (amount: number) => formatMoney(amount / 100, currency);
  const amounts = checkoutAmounts(preview, payment, taxPending);
  const displayedTotal = amounts.total != null ? money(amounts.total) : '—';
  const totalLabel = t(amounts.taxKnown ? 'checkout.total' : 'checkout.totalBeforeTax');
  const taxLabel = amounts.taxRate != null
    ? t('checkout.taxWithRate', { rate: new Intl.NumberFormat(i18n.language).format(amounts.taxRate) }) : t('checkout.tax');
  const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const accessStart = date(preview?.access_starts_at);
  const accessUntil = date(preview?.access_until);
  const seats = planSeats(plan.id);
  const planName = seats === null ? t('checkout.unlimited') : seats === 1 ? t('checkout.solo') : t('checkout.members', { count: seats });
  const paymentError = error || payment?.error || (amounts.invalidPayment ? t('checkout.invalidPaymentAmount') : '');
  return <aside className={styles.summary} aria-label={t('checkout.paymentDetails')} data-expanded={expanded || undefined}>
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
        {t('checkout.paymentDetails')}<ChevronDown size={14} /></button>
      <div className={styles.receipt}>
        {amounts.promoDiscount > 0 && <FirstPaymentPromo code={amounts.promoCode!} percent={amounts.promoPercent} compact />}
        <div className={styles.receiptRow}><span>{t('checkout.purchase')}</span><strong>{amounts.amountBeforePromo != null ? money(amounts.amountBeforePromo) : '—'}</strong></div>
        {amounts.promoDiscount > 0 && <>
          <div className={`${styles.receiptRow} ${styles.receiptPromo}`}><span>{t('promo.savings', { percent: amounts.promoPercent })}</span><strong>−{money(amounts.promoDiscount)}</strong></div>
          <div className={styles.receiptRow}><span>{t('promo.discountedNet')}</span><strong>{money(amounts.net!)}</strong></div>
        </>}
        <div className={styles.receiptRow}><span>{taxLabel}</span><span>{amounts.tax != null ? money(amounts.tax)
          : t(amounts.requiresReview ? 'checkout.taxReview' : 'checkout.taxAtPayment')}</span></div>
        {amounts.taxReason && <p className={styles.hint}>{t(`checkout.${amounts.taxReason === 'reverse_charge'
          ? 'reverseCharge' : amounts.taxReason === 'out_of_scope' ? 'taxOutOfScope' : 'taxExempt'}`)}</p>}
        <div className={styles.total}><span>{totalLabel}</span><strong>{displayedTotal}</strong></div>
      </div>
      {accessUntil && <p className={styles.deferred}>{t(accessStart ? 'checkout.accessPeriod' : 'checkout.accessUntil', {
        start: accessStart, end: accessUntil, date: accessUntil,
      })}</p>}
      <p className={styles.hint}>{t('checkout.noAutoRenewal')}</p>
      {preview?.kind === 'switch' && <p className={styles.warning}>{t('checkout.switchWarning')}</p>}
    </div>
    <div ref={footerRef} className={styles.summaryFooter}>
      {paymentError && <p className={styles.error} role="alert">{paymentError}</p>}
      <div className={styles.mobileTotal}><span>{totalLabel}</span><strong>{displayedTotal}</strong></div>
      <div className={styles.payArea}><AnimatedPayButton onClick={payment?.submit ?? onPrepare}
        loading={preparing || payment?.busy} disabled={payment ? !payment.ready || amounts.requiresReview || amounts.invalidPayment : !canPrepare}>
        {t(preparing ? 'checkout.preparing' : !payment ? 'checkout.continue' : 'checkout.pay', { amount: amounts.total != null ? money(amounts.total) : '' })}
      </AnimatedPayButton></div>
      <p className={styles.secure}><ShieldCheck size={13} />{t('checkout.secure')}</p>
    </div>
    <p className={styles.legal}>{t('checkout.agreement')} <a href={TERMS_URL} {...LEGAL_LINK_PROPS}>{t('legal.terms')}</a>
      {' · '}<a href={PRIVACY_URL} {...LEGAL_LINK_PROPS}>{t('legal.privacy')}</a></p>
  </aside>;
}
