import { createPortal } from 'react-dom';
import type { PlanType } from '../../types';
import { ZapIcon, InfoIcon } from '../ui/BillingIcons';
import { plans } from '../../constants';

interface Props {
  selectedPlan: PlanType;
  selectedPeriod: number;
  periodDiscounts: Record<number, number>;
  getPrice: (plan: PlanType, period: number) => number;
  savedTotal: number;
  totalToPay: number;
  onClose: () => void;
}

export default function UpgradeModal({ selectedPlan, selectedPeriod, periodDiscounts, getPrice, savedTotal, totalToPay, onClose }: Props) {
  const plan = plans[selectedPlan];

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.6)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-card)', borderRadius: '24px', padding: '40px', maxWidth: '440px', width: '100%', boxShadow: '0 40px 120px rgba(26,26,26,0.25)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(252,174,145,0.12)', border: '1.5px solid rgba(252,174,145,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <ZapIcon />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.5px', marginBottom: '8px' }}>
            Переход на {plan.name}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.6' }}>
            Стоимость ₽{getPrice(selectedPlan, selectedPeriod).toLocaleString('ru-RU')}/мес.
            {selectedPeriod > 1 && ` Со скидкой ${periodDiscounts[selectedPeriod] * 100}% при оплате за ${selectedPeriod} мес.`}
          </p>
        </div>

        <div style={{ padding: '16px 20px', background: 'rgba(252,174,145,0.06)', borderRadius: '14px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Тариф</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{plan.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Период</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>
              {selectedPeriod === 1 ? '1 месяц' : `${selectedPeriod} месяцев`}
            </span>
          </div>
          {selectedPeriod > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Скидка</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pistachio)' }}>
                −{periodDiscounts[selectedPeriod] * 100}% (−₽{savedTotal.toLocaleString('ru-RU')})
              </span>
            </div>
          )}
          <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>Итого</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)' }}>₽{totalToPay.toLocaleString('ru-RU')}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button style={{ padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--peach)', color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(252,174,145,0.35)', transition: 'all 0.2s ease' }}>
            Подтвердить и оплатить
          </button>
          <button onClick={onClose} style={{ padding: '14px', borderRadius: '12px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease' }}>
            Отмена
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '16px' }}>
          <InfoIcon />
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Защищено PCI DSS · Возврат в течение 7 дней</span>
        </div>
      </div>
    </div>,
  document.body
  );
}
