import { useState } from 'react';
import { IconCheck } from '../../ui/LoyaltyIcons';

export default function DiscountsConfig() {
  const [discountType, setDiscountType] = useState('Процент (%)');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Тип скидки</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {['Процент (%)', 'Фиксированная (₽)', 'Кэшбэк'].map(t => (
            <button key={t} onClick={() => setDiscountType(t)} style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${discountType === t ? 'rgba(91,171,114,0.4)' : 'var(--border)'}`,
              background: discountType === t ? 'rgba(91,171,114,0.1)' : 'var(--bg)',
              color: discountType === t ? '#5BAB72' : 'var(--text2)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Размер скидки</label>
            <input type="number" defaultValue="10" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Минимальная сумма покупки</label>
            <input type="number" placeholder="Без ограничений" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Условия применения</div>
        {[
          'Применять ко всем услугам',
          'Суммировать с другими скидками',
          'Показывать клиенту в личном кабинете',
        ].map((opt, i) => (
          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: i === 0 ? '#FCAE91' : 'var(--bg)', border: `1px solid ${i === 0 ? '#FCAE91' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white' }}>
              {i === 0 && <IconCheck />}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
