import { useState } from 'react';
import { IconCheck } from '../../ui/LoyaltyIcons';

const PACKAGES = [
  { name: 'Мини',     count: '8',  price: '7 200',  perVisit: '900' },
  { name: 'Стандарт', count: '12', price: '9 600',  perVisit: '800' },
  { name: 'Макси',    count: '20', price: '14 000', perVisit: '700' },
];

const SETTINGS = ['Заморозка абонемента', 'Перенос на другого клиента', 'Автопродление'];

export default function SubscriptionsConfig() {
  const [selectedPkg, setSelectedPkg] = useState<number | null>(null);
  const [settings, setSettings] = useState([true, false, false]);

  const toggleSetting = (i: number) =>
    setSettings(prev => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Пакеты занятий</div>
        {PACKAGES.map((pkg, i) => {
          const isSelected = selectedPkg === i;
          return (
            <div
              key={i}
              onClick={() => setSelectedPkg(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${isSelected ? 'rgba(252,174,145,0.45)' : 'var(--border)'}`,
                background: isSelected ? 'rgba(252,174,145,0.08)' : 'var(--bg)',
                marginBottom: '8px', cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s, transform 0.12s ease',
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.99)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#FCAE91' : 'var(--text)' }}>
                  {pkg.name} — {pkg.count} занятий
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>₽{pkg.perVisit} за визит</div>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#FCAE91' }}>₽{pkg.price}</div>
            </div>
          );
        })}
        <button style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: '13px', cursor: 'pointer', marginTop: '4px', transition: 'color 0.15s, border-color 0.15s' }}>
          + Добавить пакет
        </button>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Настройки</div>
        {SETTINGS.map((opt, i) => (
          <label
            key={i}
            onClick={() => toggleSetting(i)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', userSelect: 'none' }}
          >
            <div style={{
              width: '18px', height: '18px', borderRadius: '5px',
              background: settings[i] ? '#FCAE91' : 'var(--bg)',
              border: `1px solid ${settings[i] ? '#FCAE91' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, color: 'white',
              transition: 'background 0.15s, border-color 0.15s',
            }}>
              {settings[i] && <IconCheck />}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
