import { useState, useRef, useEffect } from 'react';
import styles from '../../../Loyalty.module.css';

const TYPES = ['Именной', 'Подарочный', 'На услугу'] as const;
type CertType = (typeof TYPES)[number];

const DEFAULT_DENOMS = ['₽1 000', '₽2 500', '₽5 000', '₽10 000'];
const SERVICES = ['Йога', 'Пилатес', 'Растяжка', 'Медитация', 'TRX'];

export default function CertificatesConfig() {
  const [certType, setCertType] = useState<CertType>('Подарочный');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [denoms, setDenoms] = useState<string[]>(DEFAULT_DENOMS);
  const [activeDenoms, setActiveDenoms] = useState<Set<string>>(new Set());
  const [addingDenom, setAddingDenom] = useState(false);
  const [newDenomValue, setNewDenomValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingDenom) inputRef.current?.focus();
  }, [addingDenom]);

  const toggleDenom = (d: string) =>
    setActiveDenoms(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

  const confirmAddDenom = () => {
    const raw = newDenomValue.trim().replace(/\s/g, '');
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num > 0) {
      const label = `₽${num.toLocaleString('ru-RU')}`;
      if (!denoms.includes(label)) {
        setDenoms(prev => [...prev, label]);
        setActiveDenoms(prev => new Set([...prev, label]));
      }
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
              onClick={() => setCertType(t)}
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
        {certType === 'Именной' && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Получатель</div>
            <input
              type="text"
              placeholder="Имя получателя"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {certType === 'Подарочный' && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Номиналы</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {denoms.map(d => (
                <button
                  key={d}
                  onClick={() => toggleDenom(d)}
                  className={styles.btnOption}
                  style={{
                    padding: '8px 16px',
                    border: `1px solid ${activeDenoms.has(d) ? 'rgba(74,128,196,0.4)' : 'var(--border)'}`,
                    background: activeDenoms.has(d) ? 'rgba(74,128,196,0.1)' : 'var(--bg)',
                    color: activeDenoms.has(d) ? '#4A80C4' : 'var(--text)',
                    fontSize: '13px', fontWeight: 600,
                  }}
                >
                  {d}
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
                    ✓
                  </button>
                  <button
                    onClick={cancelAddDenom}
                    className={styles.btnOption}
                    style={{ padding: '7px 10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text3)', fontSize: '13px' }}
                  >
                    ✕
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
                  onClick={() => setSelectedService(prev => prev === s ? null : s)}
                  className={styles.btnOption}
                  style={{
                    padding: '8px 16px',
                    border: `1px solid ${selectedService === s ? 'rgba(74,128,196,0.4)' : 'var(--border)'}`,
                    background: selectedService === s ? 'rgba(74,128,196,0.1)' : 'var(--bg)',
                    color: selectedService === s ? '#4A80C4' : 'var(--text)',
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
            <input type="number" defaultValue="365" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
