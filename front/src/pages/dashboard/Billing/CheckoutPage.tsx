import { useContext, useRef, useState } from 'react';
import { ArrowLeft, CreditCard, LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCheckoutPage } from './hooks/useCheckoutPage';
import CheckoutBrand from './components/checkout/CheckoutBrand';
import CheckoutProfile from './components/checkout/CheckoutProfile';
import CheckoutSummary from './components/checkout/CheckoutSummary';
import StripePayment from './components/checkout/StripePayment';
import { PaymentContext } from './components/checkout/PaymentContext';
import styles from './components/checkout/CheckoutPage.module.css';

function CheckoutContent({ h }: { h: ReturnType<typeof useCheckoutPage> }) {
  const { t } = useTranslation('billing');
  const payment = useContext(PaymentContext);
  const profileForm = useRef<HTMLFormElement>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const available = !!h.catalog.data && !!h.profile.data && !h.catalog.isError && !h.profile.isError;
  return <>
    <header className={styles.header}>
      <button type="button" onClick={h.back} disabled={h.busy || payment?.busy}><ArrowLeft size={17} /><span>{t('checkout.back')}</span></button>
      <a className={styles.headerLogo} href="/dashboard/billing" aria-label="Velora"><CheckoutBrand /></a>
      <span className={styles.headerSecure}><LockKeyhole size={13} />{t('checkout.secureCheckout')}</span>
    </header>
    <main className={styles.layout}>
      <div className={styles.intro}><h1>{t('checkout.title')}</h1><p>{t('checkout.subtitle')}</p></div>
      <div className={styles.workspace}>
        <section className={styles.controls}>
          {h.catalog.isLoading || h.profile.isLoading ? <p className={styles.hint}>{t('checkout.loading')}</p>
            : !available ? <div role="alert" className={styles.error}>
              <p>{t('checkout.loadError')}</p><button type="button" className={styles.textButton}
                onClick={() => { void h.catalog.refetch(); void h.profile.refetch(); }}>{t('checkout.retry')}</button>
            </div> : h.plan && <>
              <div className={styles.profileCard}>
                <h2 className={styles.sectionTitle}>{t('checkout.billingDetails')}</h2>
                <CheckoutProfile key={h.profile.dataUpdatedAt} profile={h.profile.data} locked={!!h.session}
                  formRef={profileForm} busy={h.busy || !!payment?.busy} onDirty={() => setDraftDirty(true)} onSave={async input => { await h.prepare(input); setDraftDirty(false); }} onEdit={h.editProfile} />
              </div>
              {h.error && !h.session && <p className={styles.error} role="alert">{h.error}</p>}
              <div className={styles.paymentCard}>
                <h2 className={styles.sectionTitle}>{t('checkout.paymentMethod')}<span><LockKeyhole size={12} />Stripe</span></h2>
                {payment?.fields ?? <div className={styles.paymentPlaceholder}><CreditCard size={23} />
                  <div><strong>{t('checkout.paymentPlaceholder')}</strong><span>{t('checkout.paymentHint')}</span></div></div>}
              </div>
            </>}
        </section>
        {h.plan && <CheckoutSummary plan={h.plan} period={h.period} preview={h.preview.data}
          payment={payment} taxPending={draftDirty} error={h.session ? h.error : ''} currency={h.catalog.data?.currency ?? 'EUR'}
          preparing={h.busy} canPrepare={available} onPrepare={() => profileForm.current?.requestSubmit()} onBack={h.back} />}
      </div>
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
