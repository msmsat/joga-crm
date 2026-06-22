import { useState } from 'react';

const CONDITIONS = ['После первого визита', 'После первой оплаты', 'Сразу при регистрации'];

export default function ReferralConfig() {
  const [referralBonus, setReferralBonus] = useState('На депозит');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Бонус за реферала</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Бонус рефереру (₽)</label>
            <input type="number" defaultValue="500" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Скидка новому клиенту (%)</label>
            <input type="number" defaultValue="15" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Условие начисления</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {CONDITIONS.map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: `1px solid ${i === 0 ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`, background: i === 0 ? 'rgba(252,174,145,0.06)' : 'var(--bg)', cursor: 'pointer' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${i === 0 ? '#FCAE91' : 'var(--border)'}`, background: i === 0 ? '#FCAE91' : 'transparent', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Начисление бонуса</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['Баллами', 'На депозит', 'Скидкой'].map(t => (
            <button key={t} onClick={() => setReferralBonus(t)} style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${referralBonus === t ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
              background: referralBonus === t ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
              color: referralBonus === t ? '#FCAE91' : 'var(--text2)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
