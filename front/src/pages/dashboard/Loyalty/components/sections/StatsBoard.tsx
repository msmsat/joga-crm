import type { JSX } from 'react';
import styles from '../../Loyalty.module.css';
import { chartData, totalGrowth, revenueFromLoyalty, retentionRate, avgCheck } from '../../constants';
import MiniChart from '../ui/MiniChart';
import LineChart from '../ui/LineChart';
import { IconTrend } from '../ui/LoyaltyIcons';

interface Props {
  configuredCount: number;
  mounted: boolean;
}

const miniChartRevenue = chartData.map(d => d.revenue);
const miniChartClients = chartData.map(d => d.clients);

const KPI = [
  { label: 'Удержание',    value: retentionRate, color: '#5BAB72', sub: 'клиентов' },
  { label: 'Средний чек',  value: avgCheck,       color: '#FCAE91', sub: '+12% к прошл.' },
  { label: 'Реферралов',   value: '24',           color: '#9B8EC4', sub: 'за 3 мес' },
  { label: 'Сертификатов', value: '₽85K',         color: '#4A80C4', sub: 'продано' },
];

const LEVELS = [
  { name: 'Серебро', count: 42, total: 89, col: '#B0B0C0', desc: 'до ₽10K' },
  { name: 'Золото',  count: 35, total: 89, col: '#f0c040', desc: '₽10K–50K' },
  { name: 'Платина', count: 12, total: 89, col: '#FCAE91', desc: 'от ₽50K' },
];

const emptyPlaceholder = (icon: JSX.Element) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '10px', color: 'var(--text3)' }}>
    {icon}
    <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.5 }}>Программа не подключена</div>
    <div style={{ fontSize: '11px', opacity: 0.35 }}>Данные появятся после настройки</div>
  </div>
);

export default function StatsBoard({ configuredCount, mounted }: Props) {
  const clientGrowth = chartData[chartData.length - 1].clients - chartData[0].clients;
  const clientGrowthPct = Math.round((clientGrowth / chartData[0].clients) * 100);

  return (
    <>
      {/* ─── Charts row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className={styles.statCard} style={{ animationDelay: '0.15s' }}>
          {configuredCount === 0 ? emptyPlaceholder(
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Выручка через программы</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)' }}>{revenueFromLoyalty}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', color: '#5BAB72', fontSize: '12px', fontWeight: 700 }}>
                    <IconTrend />{totalGrowth} за 6 месяцев
                  </div>
                </div>
                <MiniChart data={miniChartRevenue} color="#FCAE91" />
              </div>
              <LineChart data={chartData} color="#FCAE91" valueKey="revenue" />
            </>
          )}
        </div>

        <div className={styles.statCard} style={{ animationDelay: '0.2s' }}>
          {configuredCount === 0 ? emptyPlaceholder(
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Прирост клиентов</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)' }}>+{clientGrowth}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', color: '#5BAB72', fontSize: '12px', fontWeight: 700 }}>
                    <IconTrend />+{clientGrowthPct}% за 6 мес
                  </div>
                </div>
                <MiniChart data={miniChartClients} color="#4A80C4" />
              </div>
              <LineChart data={chartData} color="#4A80C4" valueKey="clients" />
            </>
          )}
        </div>
      </div>

      {/* ─── KPI + Levels ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', opacity: 1, transition: 'opacity 0.4s' }}>
        <div className={styles.statCard} style={{ animationDelay: '0.25s' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>Ключевые показатели</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {KPI.map((kpi, i) => (
              <div key={i} style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{kpi.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.statCard} style={{ animationDelay: '0.3s' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>Распределение по уровням</div>
          {LEVELS.map((lvl, i) => (
            <div key={i} style={{ marginBottom: i < 2 ? '18px' : '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: lvl.col, flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{lvl.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{lvl.desc}</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text2)' }}>{lvl.count}</span>
              </div>
              <div className={styles.progressBarWrap}>
                <div
                  className={styles.progressBarFill}
                  style={{
                    width: mounted ? `${(lvl.count / lvl.total) * 100}%` : '0%',
                    background: lvl.col,
                    transitionDelay: `${0.3 + i * 0.1}s`,
                  }}
                />
              </div>
            </div>
          ))}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Всего клиентов в программе</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#FCAE91' }}>89</span>
          </div>
        </div>
      </div>
    </>
  );
}
