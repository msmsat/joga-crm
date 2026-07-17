import { useBillingCalculator } from './hooks/useBillingCalculator';
import BillingHeader from './components/sections/BillingHeader';
import PlansTab from './components/tabs/PlansTab';
import InvoicesTab from './components/tabs/InvoicesTab';
import PaymentMethodTab from './components/tabs/PaymentMethodTab';
import UpgradeModal from './components/modals/UpgradeModal';

export default function Billing() {
  const h = useBillingCalculator();

  return (
    <div style={{ padding: '0 0 60px 0' }}>
      <BillingHeader
        activeTab={h.activeTab}
        setActiveTab={h.setActiveTab}
        animateCards={h.animateCards}
      />

      {h.paymentReturn && (
        <div style={{ margin: '0 32px 20px', padding: '16px 20px', background: 'rgba(163,201,168,0.12)', border: '1px solid rgba(163,201,168,0.3)', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--pistachio)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--onyx)', fontWeight: 600 }}>
            {h.plan?.status === 'active'
              ? `Оплата прошла — тариф ${h.plan.plan_name} активен.`
              : 'Обрабатываем оплату — подписка активируется в течение пары минут.'}
          </span>
        </div>
      )}

      {h.activeTab === 'plans' && (
        <PlansTab
          billingMode={h.billingMode}        setBillingMode={h.setBillingMode}
          selectedPlan={h.selectedPlan}      setSelectedPlan={h.setSelectedPlan}
          selectedPeriod={h.selectedPeriod}  setSelectedPeriod={h.setSelectedPeriod}
          fixedAmount={h.fixedAmount}        setFixedAmount={h.setFixedAmount}
          percentAmount={h.percentAmount}    setPercentAmount={h.setPercentAmount}
          estimatedRevenue={h.estimatedRevenue} setEstimatedRevenue={h.setEstimatedRevenue}
          getPrice={h.getPrice}
          periodDiscounts={h.periodDiscounts}
          plans={h.plans}
          currentMonthly={h.currentMonthly}
          discountedPrice={h.discountedPrice}
          totalToPay={h.totalToPay}
          animateCards={h.animateCards}
          setShowUpgradeModal={h.setShowUpgradeModal}
          startCheckout={h.startCheckout}
          checkoutBusy={h.checkoutBusy}
        />
      )}

      {h.activeTab === 'invoices' && <InvoicesTab />}

      {h.activeTab === 'method' && <PaymentMethodTab />}

      {h.showUpgradeModal && (
        <UpgradeModal
          selectedPlan={h.selectedPlan}
          selectedPeriod={h.selectedPeriod}
          periodDiscounts={h.periodDiscounts}
          plans={h.plans}
          getPrice={h.getPrice}
          savedTotal={h.savedTotal}
          totalToPay={h.totalToPay}
          onClose={() => h.setShowUpgradeModal(false)}
          startCheckout={h.startCheckout}
          checkoutBusy={h.checkoutBusy}
        />
      )}
    </div>
  );
}
