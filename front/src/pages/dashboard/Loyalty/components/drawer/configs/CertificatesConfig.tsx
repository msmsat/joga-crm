import { useState, useRef, useEffect } from 'react';
import styles from '../../../Loyalty.module.css';
import type { CertificateConfig as CertificateConfigType } from '../../../../../../api/loyalty/loyalty.types';

interface Props {
  value: CertificateConfigType | null;
  onChange: (patch: Partial<CertificateConfigType>) => void;
}

const TYPES = ['Именной', 'Подарочный', 'На услугу'] as const;
const DEFAULT_DENOMS = [1000, 2500, 5000, 10000];
const SERVICES = ['Йога', 'Пилатес', 'Растяжка', 'Медитация', 'TRX'];
const fmt = (n: number) => `₽${n.toLocaleString('ru-RU')}`;

export default function CertificatesConfig({ value, onChange }: Props) {
  const certType = value?.cert_type ?? 'Подарочный';
  const expiryDays = value?.expiry_days ?? 365;
  const serviceName = value?.service_name ?? null;
  const activeDenoms = value?.denominations ?? [];

  // Каталог кнопок номиналов = дефолты + всё, что уже выбрано (чтобы кастомные не исчезали).
  const denomChoices = Array.from(new Set([...DEFAULT_DENOMS, ...activeDenoms])).sort((a, b) => a - b);

  const [addingDenom, setAddingDenom] = useState(false);
  const [newDenomValue, setNewDenomValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingDenom) inputRef.current?.focus();
  }, [addingDenom]);

  const toggleDenom = (d: number) =>
    onChange({ denominations: activeDenoms.includes(d) ? activeDenoms.filter(x => x !== d) : [...activeDenoms, d] });

  const confirmAddDenom = () => {
    const num = parseInt(newDenomValue.trim().replace(/\s/g, ''), 10);
    if (!isNaN(num) && num > 0 && !activeDenoms.includes(num)) {
      onChange({ denominations: [...activeDenoms, num] });
    }
    setNewDenomValue('');
    setAddingDenom(false);
  };

  const cancelAddDenom = () => {
    setNewDenomValue('');
    setAddingDenom(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Тип сертификата</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => onChange({ cert_type: t })}
              className={styles.btnOption}
              style={{
                padding: '8px 14px',
                border: `1px solid ${certType === t ? 'rgba(74,128,196,0.4)' : 'var(--border)'}`,
                background: certType === t ? 'rgba(74,128,196,0.1)' : 'var(--bg)',
                color: certType === t ? '#4A80C4' : 'var(--text2)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div key={certType} style={{ animation: 'fadeSlideIn 0.2s ease both', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {certType === 'Подарочный' && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Номиналы</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {denomChoices.map(d => (
                <button
                  key={d}
                  onClick={() => toggleDenom(d)}
                  className={styles.btnOption}
                  style={{
                    padding: '8px 16px',
                    border: `1px solid ${activeDenoms.includes(d) ? 'rgba(74,128,196,0.4)' : 'var(--border)'}`,
                    background: activeDenoms.includes(d) ? 'rgba(74,128,196,0.1)' : 'var(--bg)',
                    color: activeDenoms.includes(d) ? '#4A80C4' : 'var(--text)',
                    fontSize: '13px', fontWeight: 600,
                  }}
                >
                  {fmt(d)}
                </button>
              ))}

              {addingDenom ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', animation: 'fadeSlideIn 0.15s ease both' }}>
                  <div style={{ display: 'flex', alignItems: 'center', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(74,128,196,0.5)', background: 'var(--bg)', overflow: 'hidden' }}>
                    <span style={{ padding: '0 10px', fontSize: '13px', fontWeight: 600, color: 'var(--text3)', borderRight: '1px solid var(--border)' }}>₽</span>
                    <input
                      ref={inputRef}
                      type="number"
                      min="1"
                      value={newDenomValue}
                      onChange={e => setNewDenomValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmAddDenom();
                        if (e.key === 'Escape') cancelAddDenom();
                      }}
                      placeholder="0"
                      style={{ width: '80px', padding: '7px 10px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: '13px', fontWeight: 600 }}
                    />
                  </div>
                  <button
                    onClick={confirmAddDenom}
                    className={styles.btnOption}
                    style={{ padding: '7px 12px', border: '1px solid rgba(74,128,196,0.4)', background: 'rgba(74,128,196,0.1)', color: '#4A80C4', fontSize: '13px', fontWeight: 700 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </button>
                  <button
                    onClick={cancelAddDenom}
                    className={styles.btnOption}
                    style={{ padding: '7px 10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text3)', fontSize: '13px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingDenom(true)}
                  className={styles.btnOption}
                  style={{ padding: '8px 16px', border: '1px dashed var(--border)', background: 'var(--bg)', color: 'var(--text3)', fontSize: '13px', fontWeight: 600 }}
                >
                  + Добавить
                </button>
              )}
            </div>
          </div>
        )}

        {certType === 'На услугу' && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Услуга</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {SERVICES.map(s => (
                <button
                  key={s}
                  onClick={() => onChange({ service_name: serviceName === s ? null : s })}
                  className={styles.btnOption}
                  style={{
                    padding: '8px 16px',
                    border: `1px solid ${serviceName === s ? 'rgba(74,128,196,0.4)' : 'var(--border)'}`,
                    background: serviceName === s ? 'rgba(74,128,196,0.1)' : 'var(--bg)',
                    color: serviceName === s ? '#4A80C4' : 'var(--text)',
                    fontSize: '13px', fontWeight: 600,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Параметры</div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Срок действия (дней)</label>
            <input type="number" value={expiryDays} onChange={e => onChange({ expiry_days: Number(e.target.value) })} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
