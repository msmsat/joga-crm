import { useState } from 'react';
import type { ToastType } from '../../types';
import { PAYMENT_METHODS_DATA } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import { Toggle } from '../ui/Toggle';

export default function PaymentMethodsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [methods, setMethods] = useState(PAYMENT_METHODS_DATA);

  const toggle = (id: number) => {
    setMethods(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
    showToast('Настройка сохранена', 'success');
  };

  const icons: Record<string, React.ReactNode> = {
    card: <Ico.Card />, cash: <Ico.Cash />, qr: <Ico.QR />, nfc: <Ico.Phone />,
    bnpl: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M8 10h2l2 4 2-6 2 4"/></svg>,
  };

  const totalTx = methods.filter(m => m.enabled).reduce((s, m) => s + m.transactions, 0);

  return (
    <>
      <div className="card card-sm" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '24px', background: 'linear-gradient(135deg, rgba(252,174,145,0.06) 0%, transparent 60%)' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Активных методов</div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>{methods.filter(m => m.enabled).length}</div>
        </div>
        <div style={{ width: '1px', height: '40px', background: 'var(--border)' }} />
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Транзакций за месяц</div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>{totalTx}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {methods.map(m => (
          <div key={m.id} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: '14px', opacity: m.enabled ? 1 : 0.55, transition: 'all 0.2s' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0, background: m.enabled ? 'rgba(252,174,145,0.15)' : 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.enabled ? 'var(--accent)' : 'var(--text3)', transition: 'all 0.2s' }}>
              {icons[m.icon]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{m.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{m.desc}</div>
            </div>
            <div style={{ textAlign: 'right', marginRight: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginBottom: '2px' }}>Комиссия: {m.commission}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{m.transactions} транзакций</div>
            </div>
            <Toggle on={m.enabled} onChange={() => toggle(m.id)} />
          </div>
        ))}
      </div>
    </>
  );
}
