import { useTranslation } from 'react-i18next';
import type { PlanType } from '../../types';
import { formatMoney } from '../../../../../lib/money';
import { InfoIcon } from '../ui/BillingIcons';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton } from '../../../../../components/ui/index';

interface Props {
  currency?: string;
  selectedPlan: PlanType;
  selectedPeriod: number;
  periodDiscounts: Record<number, number>;
  plans: Record<PlanType, { name: string; monthly: number; color: string }>;
  getPrice: (plan: PlanType, period: number) => number;
  savedTotal: number;
  totalToPay: number;
  onClose: () => void;
  startCheckout: () => void;
}

export default function UpgradeModal({ currency, selectedPlan, selectedPeriod, periodDiscounts, plans, getPrice, savedTotal, totalToPay, onClose, startCheckout }: Props) {
  const { t } = useTranslation('billing');
  const plan = plans[selectedPlan];
  const subtitle = t('upgrade.priceLine', { price: formatMoney(getPrice(selectedPlan, selectedPeriod), currency) })
    + (selectedPeriod > 1 ? t('upgrade.discountNote', { percent: periodDiscounts[selectedPeriod] * 100, period: selectedPeriod }) : '');

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={t('upgrade.title', { plan: plan.name })} subtitle={subtitle} />
      <ModalBody>
        <div style={{ padding: '16px 20px', background: 'rgba(252,174,145,0.06)', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('upgrade.planLabel')}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{plan.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('upgrade.periodLabel')}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>
              {t('upgrade.periodValue', { count: selectedPeriod })}
            </span>
          </div>
          {selectedPeriod > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('upgrade.discountLabel')}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pistachio)' }}>
                −{periodDiscounts[selectedPeriod] * 100}% (−{formatMoney(savedTotal, currency)})
              </span>
            </div>
          )}
          <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>{t('upgrade.totalLabel')}</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)' }}>{formatMoney(totalToPay, currency)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <InfoIcon />
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('upgrade.trustNote')}</span>
        </div>
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t('common:cancel')}</GhostButton>
        <PrimaryButton onClick={() => { onClose(); startCheckout(); }}>
          {t('upgrade.confirmAndPay')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
