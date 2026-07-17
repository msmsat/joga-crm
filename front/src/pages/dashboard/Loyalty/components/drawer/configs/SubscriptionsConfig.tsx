import { useEffect, useState } from 'react';
import { IconCheck } from '../../ui/LoyaltyIcons';
import { loyaltyApi } from '../../../../../../api/loyalty/loyalty.api';
import type {
  SubscriptionPackage,
  SubscriptionProgramConfig as SubscriptionConfigType,
} from '../../../../../../api/loyalty/loyalty.types';

interface Props {
  value: SubscriptionConfigType | null;
  onChange: (patch: Partial<SubscriptionConfigType>) => void;
}

const SETTINGS: { label: string; key: keyof Omit<SubscriptionConfigType, 'is_enabled'> }[] = [
  { label: 'Заморозка абонемента', key: 'allow_freeze' },
  { label: 'Перенос на другого клиента', key: 'allow_transfer' },
  { label: 'Автопродление', key: 'auto_renewal' },
];

const fmt = (n: number) => n.toLocaleString('ru-RU');

export default function SubscriptionsConfig({ value, onChange }: Props) {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<number | null>(null);

  useEffect(() => {
    loyaltyApi.getSubscriptionPackages().then(setPackages).catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Пакеты занятий</div>
        {packages.length === 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text3)', padding: '4px 0 12px' }}>Пакетов пока нет</div>
        )}
        {packages.map(pkg => {
          const isSelected = selectedPkg === pkg.id;
          return (
            <div
              key={pkg.id}
              onClick={() => setSelectedPkg(pkg.id)}
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
                  {pkg.name} — {pkg.class_count} занятий
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>₽{fmt(pkg.per_visit_price)} за визит</div>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#FCAE91' }}>₽{fmt(pkg.price)}</div>
            </div>
          );
        })}
        {/* ponytail: пакеты read-only; CRUD-форма добавления — отдельная задача, API готов (loyaltyApi.createSubscriptionPackage) */}
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Настройки</div>
        {SETTINGS.map((opt, i) => {
          const checked = value?.[opt.key] ?? (opt.key === 'allow_freeze');
          return (
            <label
              key={opt.key}
              onClick={() => onChange({ [opt.key]: !checked } as Partial<SubscriptionConfigType>)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', userSelect: 'none' }}
            >
              <div style={{
                width: '18px', height: '18px', borderRadius: '5px',
                background: checked ? '#FCAE91' : 'var(--bg)',
                border: `1px solid ${checked ? '#FCAE91' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: 'white',
                transition: 'background 0.15s, border-color 0.15s',
              }}>
                {checked && <IconCheck />}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
