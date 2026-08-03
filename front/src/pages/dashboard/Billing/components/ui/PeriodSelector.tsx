import { useTranslation } from 'react-i18next';
import { CalendarIcon } from './BillingIcons';

interface Props {
  selectedPeriod: 1 | 6 | 12 | 24;
  setSelectedPeriod: (period: 1 | 6 | 12 | 24) => void;
  periodDiscounts: Record<number, number>;
}

// Переиспользуется подпиской и комбо-режимом (эпик B3, задача 2) — период всегда
// один и тот же блок, в комбо он двигает только фикс-часть.
export default function PeriodSelector({ selectedPeriod, setSelectedPeriod, periodDiscounts }: Props) {
  const { t } = useTranslation('billing');

  return (
    <div className="bl-card bl-period" style={{ padding: '24px 32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', marginBottom: '20px' }}>
      {/* На телефоне шапка раскладывается display:contents (см. .bl-period-head),
          и плашка «скидка активна» уходит под плитки — над ними она садилась на
          бейдж «Лучший выбор». */}
      <div className="bl-period-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div className="bl-period-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarIcon />
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('period.title')}</span>
        </div>
        {selectedPeriod > 1 && (
          <div className="bl-period-badge" style={{ padding: '4px 12px', background: 'rgba(163,201,168,0.15)', border: '1px solid rgba(163,201,168,0.3)', borderRadius: '100px', fontSize: '12px', fontWeight: 700, color: 'var(--pistachio)' }}>
            {t('period.discountActive', { percent: periodDiscounts[selectedPeriod] * 100 })}
          </div>
        )}
      </div>
      <div className="bl-periods" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: '12px' }}>
        {([
          { period: 1  as const, discount: 0,  popular: false },
          { period: 6  as const, discount: 20, popular: false },
          { period: 12 as const, discount: 30, popular: true  },
          { period: 24 as const, discount: 40, popular: false },
        ]).map(opt => (
          <button key={opt.period} onClick={() => setSelectedPeriod(opt.period)} style={{ padding: '16px', borderRadius: '14px', border: `1.5px solid ${selectedPeriod === opt.period ? 'var(--peach)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'center', background: selectedPeriod === opt.period ? 'linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(249,160,139,0.04) 100%)' : 'transparent', transition: 'all 0.25s ease', fontFamily: 'inherit', position: 'relative', boxShadow: selectedPeriod === opt.period ? '0 4px 20px rgba(252,174,145,0.15)' : 'none' }}>
            {opt.popular && <div style={{ position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)', padding: '2px 10px', background: 'var(--peach)', color: 'white', fontSize: '10px', fontWeight: 700, borderRadius: '100px', whiteSpace: 'nowrap', letterSpacing: '0.5px' }}>{t('planCards.bestChoice')}</div>}
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)', marginBottom: '4px' }}>{t(`period.${opt.period}`)}</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: opt.discount > 0 ? 'var(--pistachio)' : 'var(--muted)' }}>{opt.discount > 0 ? t('period.discountLabel', { percent: opt.discount }) : t('period.noDiscount')}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
