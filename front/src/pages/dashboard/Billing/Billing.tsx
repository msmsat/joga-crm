import { useTranslation } from 'react-i18next';
import type { PlanType } from './types';
import { useBillingCalculator } from './hooks/useBillingCalculator';
import BillingHeader from './components/sections/BillingHeader';
import OfflineFeeCard from './components/sections/OfflineFeeCard';
import TrialOfferCard from './components/sections/TrialOfferCard';
import PlansTab from './components/tabs/PlansTab';
import InvoicesTab from './components/tabs/InvoicesTab';
import PaymentMethodTab from './components/tabs/PaymentMethodTab';
import PayModal from './components/modals/PayModal';
import BillingProfileModal from './components/modals/BillingProfileModal';
import styles from './Billing.module.css';
import { LEGAL_LINK_PROPS, PRIVACY_URL, TERMS_URL } from '../../../utils/legal';

export default function Billing() {
  const { t } = useTranslation('billing');
  const h = useBillingCalculator();

  return (
    // Класс — зацепка для телефонных правил: страница свёрстана инлайном
    // (см. блок «ТЕЛЕФОН» в Billing.module.css).
    <div className={styles.blPane} style={{ padding: '0 0 60px 0' }}>
      <BillingHeader
        currency={h.currency}
        activeTab={h.activeTab}
        setActiveTab={h.setActiveTab}
        animateCards={h.animateCards}
        plan={h.plan}
        plans={h.plans}
        stats={h.stats}
      />

      {/* Выше вкладок и цен: студия без подписки пришла сюда с пейволла, и
          первое, что она должна увидеть, — что бесплатные дни ещё доступны. */}
      <TrialOfferCard plan={h.plan} />

      <OfflineFeeCard plan={h.plan} />

      {h.paymentReturn && (
        <div style={{ margin: '0 32px 20px', padding: '16px 20px', background: 'rgba(163,201,168,0.12)', border: '1px solid rgba(163,201,168,0.3)', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--pistachio)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--onyx)', fontWeight: 600 }}>
            {h.plan?.status === 'active'
              ? t('paymentReturn.done', { plan: h.plans[h.plan.plan_name as PlanType]?.name ?? h.plan.plan_name })
              : t('paymentReturn.processing')}
          </span>
        </div>
      )}

      {h.activeTab === 'plans' && (
        <PlansTab
          currency={h.currency}
          billingMode={h.billingMode}        setBillingMode={h.setBillingMode}
          selectedPlan={h.selectedPlan}      setSelectedPlan={h.setSelectedPlan}
          selectedPeriod={h.selectedPeriod}  setSelectedPeriod={h.setSelectedPeriod}
          getPrice={h.getPrice}
          periodDiscounts={h.periodDiscounts}
          plans={h.plans}
          currentMonthly={h.currentMonthly}
          discountedPrice={h.discountedPrice}
          totalToPay={h.totalToPay}
          animateCards={h.animateCards}
          startCheckout={h.startCheckout}
          activateModel={h.activateModel}
          modelBusy={h.modelBusy}
          plan={h.plan}
          minMonthly={h.minMonthly}
          terms={h.terms}
        />
      )}

      {h.activeTab === 'invoices' && (
        <InvoicesTab
          currency={h.currency}
          invoices={h.invoices}
          loaded={h.invoicesLoaded}
          plans={h.plans}
          syncInvoice={h.syncInvoice}
        />
      )}

      {h.activeTab === 'method' && (
        <PaymentMethodTab
          cards={h.cards}
          loaded={h.cardsLoaded}
          plan={h.plan}
          setAutopay={h.setAutopay}
          openPortal={h.openPortal}
          portalBusy={h.portalBusy}
          profile={h.profile}
          profileSaving={h.profileSaving}
          saveProfile={h.saveProfile}
        />
      )}

      {/* Условия, по которым списываются деньги, должны быть доступны с той же
          страницы, где их списывают, — а не только в письме о платеже. */}
      <p style={{ margin: '24px 0 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        <a href={TERMS_URL} {...LEGAL_LINK_PROPS} style={{ color: 'var(--muted)' }}>{t('legal.terms')}</a>
        {' · '}
        <a href={PRIVACY_URL} {...LEGAL_LINK_PROPS} style={{ color: 'var(--muted)' }}>{t('legal.privacy')}</a>
      </p>

      {h.showPayModal && (
        <PayModal
          currency={h.currency}
          selectedPlan={h.selectedPlan}
          selectedPeriod={h.selectedPeriod}
          periodDiscounts={h.periodDiscounts}
          plans={h.plans}
          monthlyPrice={h.discountedPrice}
          savedTotal={h.savedTotal}
          totalToPay={h.totalToPay}
          preview={h.preview}
          previewBusy={h.previewBusy}
          payBusy={h.payBusy}
          onClose={h.closePayModal}
          onPay={h.payWithCard}
          profile={h.profile}
          onEditProfile={h.editProfileFromPay}
        />
      )}

      {/* Реквизиты плательщика перед первой оплатой. Показывается вместо модалки
          расчёта, когда адреса на аккаунте ещё нет; после сохранения сама ведёт
          к расчёту (saveProfileAndPay). */}
      {h.showProfileGate && (
        <BillingProfileModal
          profile={h.profile}
          saving={h.profileSaving}
          beforePayment
          onClose={h.closeProfileGate}
          onSave={h.saveProfileAndPay}
        />
      )}
    </div>
  );
}
