import { useTranslation } from 'react-i18next';
import type { PlanType } from '../../types';
import type { PlanInfo } from '../../hooks/useBillingCalculator';
import { formatMoney } from '../../../../../lib/money';
import { planSeats } from '../../../../../lib/plan';
import { CheckIcon } from './BillingIcons';

interface Props {
  /** Ступени каталога по возрастанию: «s2» … «s20», «unlimited». */
  planIds: PlanType[];
  plans: Record<PlanType, PlanInfo>;
  selected: PlanType;
  onSelect: (plan: PlanType) => void;
  currency?: string;
  /** Цена выбранной ступени за месяц со скидкой периода. */
  monthly: number;
  /** Она же без скидки — зачёркнутая рядом. */
  fullMonthly: number;
  discount: number;
  /** Ступень, за которую студия платит сейчас, — бейджем «Текущий». */
  currentPlanId: PlanType | null;
}

const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="7" cy="5.5" r="2.75" stroke="var(--peach)" strokeWidth="1.5" />
    <path d="M2 15c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12.5 3.2a2.75 2.75 0 010 4.6M13.5 11.4c1.6.6 2.5 1.8 2.5 3.6" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/**
 * Тариф = места. Линия ступеней от 2 сотрудников до 20 и «безлимит» на конце:
 * студия выбирает не коробку с названием, а число людей, которых заводит в CRM.
 *
 * Цена растёт по прямой (каждое место +фикс), поэтому линия и есть честная
 * картинка прайса — а не три карточки, между которыми надо угадывать.
 * Числа берём из каталога: своей формулы цены здесь нет и быть не должно.
 */
export default function SeatSelector({
  planIds, plans, selected, onSelect, currency,
  monthly, fullMonthly, discount, currentPlanId,
}: Props) {
  const { t } = useTranslation('billing');
  const seats = planSeats(selected);
  const index = Math.max(planIds.indexOf(selected), 0);
  // Цена входа и шаг за место — ИЗ КАТАЛОГА, разностью соседних ступеней. Написать
  // «от 15 €, дальше +5 €» словами значило бы завести на фронте второй прайс-лист,
  // который переживёт правку plans.py и будет обещать неправду.
  const base = plans[planIds[0]]?.monthly ?? 0;
  const step = (plans[planIds[1]]?.monthly ?? 0) - base;
  // Заливка линии — до центра выбранной кнопки, поэтому доля считается по
  // серединам крайних, а не по краям контейнера.
  const filled = planIds.length > 1 ? (index / (planIds.length - 1)) * 100 : 0;

  return (
    <div className="bl-card bl-seats-card" style={{ padding: '28px 32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', marginBottom: '20px' }}>
      <div className="bl-seats-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UsersIcon />
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('seats.title')}</span>
        </div>
        <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>{t('seats.hint', { amount: formatMoney(base, currency) })}</span>
      </div>

      {/* Линия: дорожка позади ряда кнопок, залитая до выбранной ступени. */}
      <div className="bl-seats-line" style={{ position: 'relative', padding: '2px 0' }}>
        <div style={{ position: 'absolute', left: '18px', right: '18px', top: '50%', height: '2px', marginTop: '-1px', background: 'var(--border)', borderRadius: '2px' }} />
        <div style={{ position: 'absolute', left: '18px', width: `calc((100% - 36px) * ${filled / 100})`, top: '50%', height: '2px', marginTop: '-1px', background: 'var(--peach)', borderRadius: '2px', transition: 'width 0.3s cubic-bezier(0.34,1.1,0.64,1)' }} />
        <div className="bl-seats" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
          {planIds.map(planId => {
            const count = planSeats(planId);
            const isSelected = planId === selected;
            return (
              <button
                key={planId}
                onClick={() => onSelect(planId)}
                aria-pressed={isSelected}
                aria-label={plans[planId]?.name ?? planId}
                style={{
                  width: '36px', height: '36px', flex: '0 0 auto', borderRadius: '12px',
                  border: `1.5px solid ${isSelected ? 'var(--peach)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--peach)' : 'var(--bg-card)',
                  color: isSelected ? 'white' : 'var(--muted)',
                  fontSize: count === null ? '17px' : '13px', fontWeight: 700, fontFamily: 'inherit',
                  cursor: 'pointer', lineHeight: 1,
                  transition: 'all 0.2s cubic-bezier(0.34,1.1,0.64,1)',
                  transform: isSelected ? 'scale(1.12)' : 'none',
                  boxShadow: isSelected ? '0 6px 18px rgba(252,174,145,0.4)' : 'none',
                }}
              >
                {count === null ? '∞' : count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Что выбрано и сколько это стоит. Одна строка вместо трёх карточек:
          отличается между ступенями только число мест и цена. */}
      <div className="bl-seats-sum" style={{ marginTop: '26px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--onyx)' }}>
              {seats === null ? t('planCards.staffUnlimited') : t('planCards.staffLimit', { count: seats ?? 0 })}
            </span>
            {currentPlanId === selected && (
              <span style={{ padding: '3px 10px', background: 'rgba(252,174,145,0.15)', border: '1px solid rgba(252,174,145,0.3)', borderRadius: '100px', fontSize: '10px', fontWeight: 700, color: 'var(--peach)' }}>
                {t('planCards.current')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: 'var(--muted)' }}>
            <CheckIcon size={15} />
            {seats === null ? t('seats.unlimitedNote') : t('seats.stepNote', { amount: formatMoney(step, currency) })}
          </div>
        </div>

        <div className="bl-seats-price" style={{ textAlign: 'right' }}>
          <div>
            <span style={{ fontSize: '34px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-1px' }}>{formatMoney(monthly, currency)}</span>
            <span style={{ fontSize: '13px', color: 'var(--muted)', marginLeft: '4px' }}>{t('planCards.perMonth')}</span>
          </div>
          {discount > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              <span style={{ textDecoration: 'line-through' }}>{formatMoney(fullMonthly, currency)}</span>
              <span style={{ color: 'var(--pistachio)', fontWeight: 700, marginLeft: '6px' }}>−{Math.round(discount * 100)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
