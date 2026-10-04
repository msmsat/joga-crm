import { useContext, useRef, useState, type RefCallback } from 'react';
import { ArrowLeft, CreditCard, LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCheckoutPage } from './hooks/useCheckoutPage';
import { useCheckoutViewport } from './hooks/useCheckoutViewport';
import CheckoutBrand from './components/checkout/CheckoutBrand';
import CheckoutProfile from './components/checkout/CheckoutProfile';
import CheckoutSummary from './components/checkout/CheckoutSummary';
import StripePayment from './components/checkout/StripePayment';
import { PaymentContext } from './components/checkout/PaymentContext';
import styles from './components/checkout/CheckoutPage.module.css';

function CheckoutContent({ h, footerRef }: { h: ReturnType<typeof useCheckoutPage>; footerRef: RefCallback<HTMLDivElement> }) {
  const { t, i18n } = useTranslation('billing');
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
                  formRef={profileForm} busy={h.busy || !!payment?.busy} onDirty={() => setDraftDirty(true)} onSave={async input => { await h.prepare(input); setDraftDirty(false); }} onEdit={h.editProfile}>
                  {h.combo && !h.session && h.catalog.data && <div className={styles.comboTerms}>
                    <details><summary>{t('mode.termsTitle')}</summary>
                      <p>{t('mode.termsMessage', {
                        rate: h.catalog.data.combo_rate.toLocaleString(i18n.language), days: h.catalog.data.grace_days,
                      })}</p>
                    </details>
                    <label className={styles.comboAccept}>
                      <input type="checkbox" required checked={h.comboAccepted} disabled={h.busy}
                        onChange={event => h.setComboAccepted(event.target.checked)} />
                      {t('mode.termsConfirm')}
                    </label>
                  </div>}
                </CheckoutProfile>
              </div>
              {h.error && !h.session && <p className={styles.error} role="alert">{h.error}</p>}
              <div className={styles.paymentCard}>
                <h2 className={styles.sectionTitle}>{t('checkout.paymentMethod')}<span><LockKeyhole size={12} />Stripe</span></h2>
                {payment?.fields ?? <div className={styles.paymentPlaceholder}><CreditCard size={23} />
                  <div><strong>{t('checkout.paymentPlaceholder')}</strong><span>{t('checkout.paymentHint')}</span></div></div>}
              </div>
            </>}
        </section>
        {h.plan && <CheckoutSummary footerRef={footerRef} plan={h.plan} period={h.period} preview={h.preview.data}
          payment={payment} taxPending={draftDirty} error={h.session ? h.error : ''} currency={h.catalog.data?.currency ?? 'EUR'}
          preparing={h.busy} canPrepare={available} onPrepare={() => profileForm.current?.requestSubmit()} onBack={h.back} />}
      </div>
    </main>
  </>;
}

export default function CheckoutPage() {
  const h = useCheckoutPage();
  const { pageRef, footerRef } = useCheckoutViewport();
  return <div ref={pageRef} className={styles.page}>
    {h.session?.client_secret && h.session.publishable_key && h.profile.data
      ? <StripePayment key={h.session.client_secret} session={h.session} profile={h.profile.data}
          returnUrl={h.returnUrl} onComplete={h.completed}><CheckoutContent h={h} footerRef={footerRef} /></StripePayment>
      : <CheckoutContent h={h} footerRef={footerRef} />}
  </div>;
}
