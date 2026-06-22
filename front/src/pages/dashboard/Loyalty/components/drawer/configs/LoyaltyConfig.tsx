import { useState } from 'react';
import styles from '../../../Loyalty.module.css';

export default function LoyaltyConfig() {
  const [loyaltyExpiry, setLoyaltyExpiry] = useState('1 год');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Основные параметры</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Название программы</label>
            <input defaultValue="Velora Club" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Начисление баллов (₽ за 1 балл)</label>
            <input type="number" defaultValue="100" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Уровни</div>
        {[
          { name: 'Серебро', from: '0',      to: '10 000', col: '#B0B0C0' },
          { name: 'Золото',  from: '10 000', to: '50 000', col: '#f0c040' },
          { name: 'Платина', from: '50 000', to: '∞',      col: '#FCAE91' },
        ].map((lvl, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: `1px solid ${lvl.col}30`, background: `${lvl.col}08`, marginBottom: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: lvl.col, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>{lvl.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>₽{lvl.from} — ₽{lvl.to}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Срок действия</div>
          <div
            className={styles.tooltipWrap}
            onMouseEnter={e => {
              const box = (e.currentTarget as HTMLElement).querySelector(`.${styles.tooltipBox}`) as HTMLElement;
              const r = e.currentTarget.getBoundingClientRect();
              box.style.top = `${r.top - 38}px`;
              box.style.left = `${r.left + r.width / 2}px`;
            }}
          >
            <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--text3)', cursor: 'default' }}>?</div>
            <div className={styles.tooltipBox}>Срок, в течение которого клиент может использовать накопленные баллы</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['3 мес', '6 мес', '1 год', 'Бессрочно'].map(opt => (
            <button key={opt} onClick={() => setLoyaltyExpiry(opt)} style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${loyaltyExpiry === opt ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
              background: loyaltyExpiry === opt ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
              color: loyaltyExpiry === opt ? '#FCAE91' : 'var(--text2)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
