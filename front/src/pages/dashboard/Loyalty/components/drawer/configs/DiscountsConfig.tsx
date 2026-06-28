import { useState } from 'react';
import { IconCheck } from '../../ui/LoyaltyIcons';
import styles from '../../../Loyalty.module.css';

const TYPES = ['Процент (%)', 'Фиксированная (₽)', 'Кэшбэк'] as const;
const CONDITIONS = [
  'Применять ко всем услугам',
  'Суммировать с другими скидками',
  'Показывать клиенту в личном кабинете',
];

export default function DiscountsConfig() {
  const [discountType, setDiscountType] = useState<string>('Процент (%)');
  const [checked, setChecked] = useState([true, false, false]);

  const toggle = (i: number) =>
    setChecked(prev => prev.map((v, idx) => (idx === i ? !v : v)));

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
              onClick={() => setDiscountType(t)}
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
                defaultValue="10"
                style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', fontWeight: 600, color: 'var(--text3)', pointerEvents: 'none' }}>
                {suffix}
              </span>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Минимальная сумма покупки</label>
            <input type="number" placeholder="Без ограничений" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Условия применения</div>
        {CONDITIONS.map((opt, i) => (
          <label
            key={i}
            onClick={() => toggle(i)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', userSelect: 'none' }}
          >
            <div style={{
              width: '18px', height: '18px', borderRadius: '5px',
              background: checked[i] ? '#FCAE91' : 'var(--bg)',
              border: `1px solid ${checked[i] ? '#FCAE91' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, color: 'white',
              transition: 'background 0.15s, border-color 0.15s',
            }}>
              {checked[i] && <IconCheck />}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
