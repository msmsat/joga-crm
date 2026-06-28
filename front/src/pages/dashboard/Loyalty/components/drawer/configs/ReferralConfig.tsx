import { useState } from 'react';
import styles from '../../../Loyalty.module.css';

const CONDITIONS = ['После первого визита', 'После первой оплаты', 'Сразу при регистрации'];
const BONUS_TYPES = ['Баллами', 'На депозит', 'Скидкой'];

export default function ReferralConfig() {
  const [condition, setCondition] = useState('После первого визита');
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
          {CONDITIONS.map((opt) => {
            const isActive = condition === opt;
            return (
              <label
                key={opt}
                onClick={() => setCondition(opt)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isActive ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                  background: isActive ? 'rgba(252,174,145,0.06)' : 'var(--bg)',
                  cursor: 'pointer', userSelect: 'none',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  border: `2px solid ${isActive ? '#FCAE91' : 'var(--border)'}`,
                  background: isActive ? '#FCAE91' : 'transparent',
                  flexShrink: 0,
                  transition: 'background 0.15s, border-color 0.15s',
                }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Начисление бонуса</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {BONUS_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setReferralBonus(t)}
              className={styles.btnOption}
              style={{
                padding: '8px 14px',
                border: `1px solid ${referralBonus === t ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                background: referralBonus === t ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
                color: referralBonus === t ? '#FCAE91' : 'var(--text2)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
