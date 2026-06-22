import type { Period } from '../types';
import { ProgressBar } from './ProgressBar';

export interface SummaryMetricsProps {
  period: Period;
  fmtRevenue: (base: number) => string;
  multiplier: number;
}

const TrendUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </svg>
);
const TrendDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>
  </svg>
);

export function SummaryMetrics({ period, fmtRevenue, multiplier }: SummaryMetricsProps) {
  const metrics = [
    {
      label: 'Выручка',
      value: fmtRevenue(284),
      change: '+18%', up: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 11h8a4 4 0 0 0 0-8H6v8zm0 0H4m2 0v8"/><line x1="4" y1="15" x2="10" y2="15"/>
        </svg>
      ),
    },
    {
      label: 'Занятий',
      value: `${Math.round(318 * multiplier)}`,
      change: `+${Math.round(24 * multiplier)}`, up: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
    {
      label: 'Средний чек',
      value: '₽1 890',
      change: '+5.2%', up: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      ),
    },
    {
      label: 'Новые клиенты',
      value: `${Math.round(12 * multiplier)}`,
      change: period === 'day' ? '−1' : '−2', up: false,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.85"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    {
      label: 'Удержание',
      value: '87%',
      change: '+3%', up: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="report-metrics" style={{ marginBottom: '20px' }}>
      {metrics.map(({ label, value, change, up, icon }) => (
        <div className="stat-card" key={label} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ color: 'rgba(252,174,145,0.6)', opacity: 0.7 }}>{icon}</div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '4px' }}>{value}</div>
          <div style={{ fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', color: up ? '#5BAB72' : '#D88C9A' }}>
            {up ? <TrendUp/> : <TrendDown/>} {change}
          </div>
        </div>
      ))}
      {/* Suppress unused import warning */}
      <div style={{ display: 'none' }}><ProgressBar value={0}/></div>
    </div>
  );
}
