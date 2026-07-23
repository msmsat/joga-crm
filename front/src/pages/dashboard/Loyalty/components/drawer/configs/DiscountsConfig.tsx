import { useTranslation } from 'react-i18next';
import { IconCheck } from '../../ui/LoyaltyIcons';
import styles from '../../../Loyalty.module.css';
import type { DiscountConfig as DiscountConfigType } from '../../../../../../api/loyalty/loyalty.types';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../components/UI';
import type { ConfigErrors } from '../../../hooks/validateConfig';

interface Props {
  value: DiscountConfigType | null;
  onChange: (patch: Partial<DiscountConfigType>) => void;
  errors?: ConfigErrors;
}

// Ключи — как хранятся в БД (модель StudioDiscountConfig.discount_type, дефолт
// 'percentage'); отображение — только через locales (config.discountTypes.*).
const TYPE_VALUES = ['percentage', 'fixed', 'cashback'] as const;

export default function DiscountsConfig({ value, onChange, errors = {} }: Props) {
  const { t } = useTranslation('loyalty');
  const currency = getCurrencySymbol(useStudioCurrency());
  const discountType = value?.discount_type ?? 'percentage';
  const discountValue = value?.discount_value ?? 10;
  const minPurchase = value?.min_purchase_amount ?? null;
  // applies_to_all_services/visible_in_cabinet скрыты (V5-7, Блок 5) — не реализованы
  // в resolve_price/мини-приложении, колонки остаются в БД. См. docs/BACKLOG.
  const conditions = [
    { labelKey: 'config.stackable', key: 'stackable' as const, checked: value?.stackable ?? false },
  ];

  const isCashback = discountType === 'cashback';
  const isFixed = discountType === 'fixed';
  const label = isCashback ? t('config.cashbackPercent') : t('config.discountSize');
  const suffix = isFixed ? currency : '%';
  const typeLabels: Record<(typeof TYPE_VALUES)[number], string> = {
    percentage: t('config.discountTypes.percentage'),
    fixed: t('config.discountTypes.fixed', { currency }),
    cashback: t('config.discountTypes.cashback'),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.discountType')}</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {TYPE_VALUES.map(val => (
            <button
              key={val}
              onClick={() => onChange({ discount_type: val })}
              className={styles.btnOption}
              style={{
                padding: '8px 14px',
                border: `1px solid ${discountType === val ? 'rgba(91,171,114,0.4)' : 'var(--border)'}`,
                background: discountType === val ? 'rgba(91,171,114,0.1)' : 'var(--bg)',
                color: discountType === val ? '#5BAB72' : 'var(--text2)',
              }}
            >
              {typeLabels[val]}
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
                style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 'var(--radius-sm)', border: `1px solid ${errors.discount_value ? '#D88C9A' : 'var(--border)'}`, background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', fontWeight: 600, color: 'var(--text3)', pointerEvents: 'none' }}>
                {suffix}
              </span>
            </div>
            {errors.discount_value && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{errors.discount_value}</div>}
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>{t('config.minPurchase')}</label>
            <input
              type="number"
              placeholder={t('config.noLimit')}
              value={minPurchase ?? ''}
              onChange={e => onChange({ min_purchase_amount: e.target.value === '' ? null : Number(e.target.value) })}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.conditions')}</div>
        {conditions.map((cond, i) => (
          <label
            key={cond.key}
            onClick={() => onChange({ [cond.key]: !cond.checked } as Partial<DiscountConfigType>)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', borderBottom: i < conditions.length - 1 ? '1px solid var(--border)' : 'none', userSelect: 'none' }}
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
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{t(cond.labelKey)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
