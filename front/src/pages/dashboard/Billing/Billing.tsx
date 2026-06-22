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
          currentMonthly={h.currentMonthly}
          discountedPrice={h.discountedPrice}
          totalToPay={h.totalToPay}
          animateCards={h.animateCards}
          setShowUpgradeModal={h.setShowUpgradeModal}
        />
      )}

      {h.activeTab === 'invoices' && <InvoicesTab />}

      {h.activeTab === 'method' && <PaymentMethodTab />}

      {h.showUpgradeModal && (
        <UpgradeModal
          selectedPlan={h.selectedPlan}
          selectedPeriod={h.selectedPeriod}
          periodDiscounts={h.periodDiscounts}
          getPrice={h.getPrice}
          savedTotal={h.savedTotal}
          totalToPay={h.totalToPay}
          onClose={() => h.setShowUpgradeModal(false)}
        />
      )}
    </div>
  );
}
