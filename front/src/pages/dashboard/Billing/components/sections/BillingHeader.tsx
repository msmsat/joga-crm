import type { BillingTab } from '../../types';
import { CalendarIcon, CreditCardIcon, TrendingIcon, ZapIcon } from '../ui/BillingIcons';
import AnimatedCounter from '../ui/AnimatedCounter';

interface Props {
  activeTab: BillingTab;
  setActiveTab: (tab: BillingTab) => void;
  animateCards: boolean;
}

const STATS = [
  { label: 'Потрачено всего',    target: 17430, prefix: '₽', suffix: '',        Icon: CreditCardIcon },
  { label: 'Месяцев с нами',     target: 7,     prefix: '',  suffix: ' мес.',   Icon: CalendarIcon   },
  { label: 'Сэкономлено',        target: 0,     prefix: '₽', suffix: ' (пока)', Icon: TrendingIcon   },
  { label: 'Следующее списание', target: 2490,  prefix: '₽', suffix: '',        Icon: ZapIcon        },
];

const TABS: { id: BillingTab; label: string }[] = [
  { id: 'plans',    label: 'Тарифы и планы'   },
  { id: 'invoices', label: 'История платежей' },
  { id: 'method',   label: 'Способ оплаты'    },
];

export default function BillingHeader({ activeTab, setActiveTab, animateCards }: Props) {
  return (
    <>
      <div style={{ padding: '32px 32px 0', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--peach)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Velora · Биллинг
            </p>
            <h1 style={{ fontSize: '32px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-1.2px', lineHeight: '1.1', marginBottom: '8px' }}>
              Тарифы и оплата
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.6' }}>
              Управляйте подпиской, способами оплаты и историей платежей
            </p>
          </div>

          <div style={{ padding: '16px 24px', background: 'linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(249,160,139,0.06) 100%)', border: '1px solid rgba(252,174,145,0.3)', borderRadius: '16px', textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', letterSpacing: '0.5px' }}>ТЕКУЩИЙ ТАРИФ</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--onyx)' }}>Pro</div>
            <div style={{ fontSize: '12px', color: 'var(--pistachio)', fontWeight: 600, marginTop: '2px' }}>Активен · до 15 июля 2025</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
              <CalendarIcon />
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>₽2 490 / мес</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '24px' }}>
          {STATS.map((stat, i) => (
            <div key={i} style={{
              padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '14px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '12px',
              opacity: animateCards ? 1 : 0,
              transform: animateCards ? 'none' : 'translateY(8px)',
              transition: `all 0.5s ease ${i * 0.07}s`,
            }}>
              <div style={{ width: '36px', height: '36px', background: 'rgba(252,174,145,0.08)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <stat.Icon />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.4px' }}>
                  <AnimatedCounter target={stat.target} prefix={stat.prefix} suffix={stat.suffix} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 32px', marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', gap: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 18px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.2s ease',
                background: activeTab === tab.id ? 'var(--peach)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--muted)',
                boxShadow: activeTab === tab.id ? '0 2px 12px rgba(252,174,145,0.35)' : 'none',
              }}
            >{tab.label}</button>
          ))}
        </div>
      </div>
    </>
  );
}
