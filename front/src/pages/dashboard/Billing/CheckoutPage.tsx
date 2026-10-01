import { useContext } from 'react';
import { ArrowLeft, CreditCard, LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCheckoutPage } from './hooks/useCheckoutPage';
import CheckoutPlans from './components/checkout/CheckoutPlans';
import CheckoutProfile from './components/checkout/CheckoutProfile';
import CheckoutSummary from './components/checkout/CheckoutSummary';
import StripePayment from './components/checkout/StripePayment';
import { PaymentContext } from './components/checkout/PaymentContext';
import styles from './components/checkout/CheckoutPage.module.css';

function CheckoutContent({ h }: { h: ReturnType<typeof useCheckoutPage> }) {
  const { t } = useTranslation('billing');
  const payment = useContext(PaymentContext);
  return <>
    <header className={styles.header}>
      <button type="button" onClick={h.back} disabled={payment?.busy}><ArrowLeft size={19} />{t('checkout.back')}</button>
      <a className={styles.headerLogo} href="/dashboard/billing" aria-label="Velora">velora<span>.</span></a>
      <span className={styles.headerSecure}><LockKeyhole size={14} />{t('checkout.secureCheckout')}</span>
    </header>
    <main className={styles.layout}>
      <section className={styles.controls}>
        <h1>{t('checkout.title')}</h1>
        <p className={styles.subtitle}>{t('checkout.subtitle')}</p>
        {h.catalog.isLoading || h.profile.isLoading ? <p className={styles.hint}>{t('checkout.loading')}</p>
          : h.catalog.isError || h.profile.isError ? <div role="alert" className={styles.error}>
            <p>{t('checkout.loadError')}</p><button type="button" className={styles.textButton}
              onClick={() => { void h.catalog.refetch(); void h.profile.refetch(); }}>{t('checkout.retry')}</button>
          </div> : h.catalog.data && h.plan && <>
            <h2 className={styles.sectionTitle}>{t('checkout.planDetails')}</h2>
            <CheckoutPlans catalog={h.catalog.data} selected={h.plan} period={h.period} combo={h.combo}
              locked={!!h.session || h.busy} onChange={h.change} />
            <h2 className={styles.sectionTitle}>{t('checkout.billingDetails')}</h2>
            <CheckoutProfile key={h.profile.dataUpdatedAt} profile={h.profile.data} locked={!!h.session}
              busy={h.busy || !!payment?.busy} onSave={h.prepare} onEdit={h.editProfile} />
            {h.error && !h.session && <p className={styles.error} role="alert">{h.error}</p>}
            <h2 className={styles.sectionTitle}>{t('checkout.paymentMethod')}</h2>
            {payment?.fields ?? <div className={styles.paymentPlaceholder}><CreditCard size={21} />
              <div><strong>{t('checkout.paymentPlaceholder')}</strong><span>{t('checkout.paymentHint')}</span></div></div>}
          </>}
      </section>
      {h.plan && <CheckoutSummary plan={h.plan} period={h.period} preview={h.preview.data}
        payment={payment} error={h.session ? h.error : ''} currency={h.catalog.data?.currency ?? 'EUR'} />}
    </main>
  </>;
}

export default function CheckoutPage() {
  const h = useCheckoutPage();
  return <div className={styles.page}>
    {h.session?.client_secret && h.session.publishable_key && h.profile.data
      ? <StripePayment key={h.session.client_secret} session={h.session} profile={h.profile.data}
          returnUrl={h.returnUrl} onComplete={h.completed}><CheckoutContent h={h} /></StripePayment>
      : <CheckoutContent h={h} />}
  </div>;
}
