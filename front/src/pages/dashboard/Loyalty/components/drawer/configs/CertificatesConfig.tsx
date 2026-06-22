import { useState } from 'react';

export default function CertificatesConfig() {
  const [certType, setCertType] = useState('Подарочный');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Тип сертификата</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {['Именной', 'Подарочный', 'На услугу'].map(t => (
            <button key={t} onClick={() => setCertType(t)} style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${certType === t ? 'rgba(74,128,196,0.4)' : 'var(--border)'}`,
              background: certType === t ? 'rgba(74,128,196,0.1)' : 'var(--bg)',
              color: certType === t ? '#4A80C4' : 'var(--text2)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Номиналы</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {['₽1 000', '₽2 500', '₽5 000', '₽10 000', '+ Добавить'].map((v, i) => (
            <button key={v} style={{
              padding: '8px 16px', borderRadius: 'var(--radius-sm)',
              border: i === 4 ? '1px dashed var(--border)' : '1px solid var(--border)',
              background: 'var(--bg)',
              color: i === 4 ? 'var(--text3)' : 'var(--text)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Параметры</div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Срок действия (дней)</label>
          <input type="number" defaultValue="365" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
        </div>
      </div>
    </div>
  );
}
