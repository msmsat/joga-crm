import { IconCheck } from '../../ui/LoyaltyIcons';
import styles from '../../../Loyalty.module.css';
import type { DiscountConfig as DiscountConfigType } from '../../../../../../api/loyalty/loyalty.types';

interface Props {
  value: DiscountConfigType | null;
  onChange: (patch: Partial<DiscountConfigType>) => void;
}

const TYPES = ['Процент (%)', 'Фиксированная (₽)', 'Кэшбэк'] as const;

export default function DiscountsConfig({ value, onChange }: Props) {
  const discountType = value?.discount_type ?? 'Процент (%)';
  const discountValue = value?.discount_value ?? 10;
  const minPurchase = value?.min_purchase_amount ?? null;
  const conditions = [
    { label: 'Применять ко всем услугам', key: 'applies_to_all_services' as const, checked: value?.applies_to_all_services ?? true },
    { label: 'Суммировать с другими скидками', key: 'stackable' as const, checked: value?.stackable ?? false },
    { label: 'Показывать клиенту в личном кабинете', key: 'visible_in_cabinet' as const, checked: value?.visible_in_cabinet ?? false },
  ];

  const isCashback = discountType === 'Кэшбэк';
  const isFixed = discountType === 'Фиксированная (₽)';
  const label = isCashback ? 'Процент кэшбэка' : 'Размер скидки';
  const suffix = isFixed ? '₽' : '%';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Тип скидки</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => onChange({ discount_type: t })}
              className={styles.btnOption}
              style={{
                padding: '8px 14px',
                border: `1px solid ${discountType === t ? 'rgba(91,171,114,0.4)' : 'var(--border)'}`,
                background: discountType === t ? 'rgba(91,171,114,0.1)' : 'var(--bg)',
                color: discountType === t ? '#5BAB72' : 'var(--text2)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
              {label}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={discountValue}
                onChange={e => onChange({ discount_value: Number(e.target.value) })}
                style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', fontWeight: 600, color: 'var(--text3)', pointerEvents: 'none' }}>
                {suffix}
              </span>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Минимальная сумма покупки</label>
            <input
              type="number"
              placeholder="Без ограничений"
              value={minPurchase ?? ''}
              onChange={e => onChange({ min_purchase_amount: e.target.value === '' ? null : Number(e.target.value) })}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Условия применения</div>
        {conditions.map((cond, i) => (
          <label
            key={cond.key}
            onClick={() => onChange({ [cond.key]: !cond.checked } as Partial<DiscountConfigType>)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', userSelect: 'none' }}
          >
            <div style={{
              width: '18px', height: '18px', borderRadius: '5px',
              background: cond.checked ? '#FCAE91' : 'var(--bg)',
              border: `1px solid ${cond.checked ? '#FCAE91' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, color: 'white',
              transition: 'background 0.15s, border-color 0.15s',
            }}>
              {cond.checked && <IconCheck />}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{cond.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
