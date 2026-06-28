import { useState, Fragment } from 'react';
import type { Period } from '../../types';
import { SALES_DATA, PERIOD_LABELS, DAILY_CHECKS, DAYS } from '../../constants';
import styles from '../../Reports.module.css';
import { ProgressBar } from '../ProgressBar';

const fmtK = (n: number): string => `₽${Math.round(n / 1000)}K`;
const fmtRub = (n: number): string => `₽${n.toLocaleString('ru-RU')}`;

function SalesIllus() {
  return (
    <svg width="110" height="70" viewBox="0 0 110 70" style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', opacity: 0.75, pointerEvents: 'none' }}>
      <circle cx="75" cy="35" r="30" fill="rgba(252,174,145,0.07)"/>
      <circle cx="75" cy="35" r="22" fill="none" stroke="rgba(252,174,145,0.12)" strokeWidth="8"/>
      <circle cx="75" cy="35" r="22" fill="none" stroke="rgba(252,174,145,0.6)" strokeWidth="8" strokeDasharray="83 55" strokeLinecap="round" transform="rotate(-90 75 35)"/>
      <circle cx="75" cy="35" r="22" fill="none" stroke="rgba(91,171,114,0.5)"  strokeWidth="8" strokeDasharray="34 104" strokeLinecap="round" transform="rotate(63 75 35)"/>
      <circle cx="75" cy="35" r="22" fill="none" stroke="rgba(74,128,196,0.4)"  strokeWidth="8" strokeDasharray="21 117" strokeLinecap="round" transform="rotate(153 75 35)"/>
      {[['Абон.', 59, '#FCAE91'], ['Разов.', 24, '#5BAB72'], ['Доп.', 17, '#4A80C4']].map(([label, pct, color], i) => (
        <g key={i}>
          <text x={0} y={16 + i * 20} fontSize="9" fill="var(--text3)" fontFamily="Manrope" fontWeight="600">{label as string}</text>
          <rect x={0} y={20 + i * 20} width="48" height="5" rx="2.5" fill="rgba(26,26,26,0.06)"/>
          <rect x={0} y={20 + i * 20} width={48 * (pct as number) / 100} height="5" rx="2.5" fill={color as string} opacity="0.7"/>
        </g>
      ))}
    </svg>
  );
}

const PAYMENT_METHODS = [
  { label: 'Карта онлайн',  pct: 54, color: 'var(--accent)', val: '₽153K' },
  { label: 'Наличные',      pct: 24, color: '#5BAB72',       val: '₽68K'  },
  { label: 'Карта на месте',pct: 18, color: '#4A80C4',       val: '₽51K'  },
  { label: 'Перевод',       pct: 4,  color: '#D88C9A',       val: '₽11K'  },
];

const maxCheck = Math.max(...DAILY_CHECKS);

export interface TabProdazhiProps {
  period: Period;
}

export function TabProdazhi({ period }: TabProdazhiProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hoveredCheck, setHoveredCheck] = useState<number | null>(null);

  const totalRevenue = {
    day: '₽10.5K', week: '₽53K', month: '₽284K', year: '₽3.4M',
  }[period];

  return (
    <>
      {/* Hero header */}
      <div className={styles.financeIllus}>
        <SalesIllus/>
        <div style={{ zIndex: 1 }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Общая выручка ({PERIOD_LABELS[period].toLowerCase()})
          </div>
          <div style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-2px' }}>{totalRevenue}</div>
          <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
            <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#5BAB72' }}>+18%</div><div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>vs прошлый</div></div>
            <div><div style={{ fontSize: '18px', fontWeight: 800 }}>140</div><div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>транзакций</div></div>
            <div><div style={{ fontSize: '18px', fontWeight: 800 }}>₽2 030</div><div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>средний чек</div></div>
          </div>
        </div>
      </div>

      {/* Products table */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Продажи по продуктам</div>
        {SALES_DATA.map((row, i) => {
          const barPct = Math.round((row.revenue / SALES_DATA[0].revenue) * 100);
          return (
            <Fragment key={i}>
              <div onClick={() => setSelected(selected === i ? null : i)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', cursor: 'pointer', marginBottom: '4px', background: selected === i ? 'rgba(252,174,145,0.08)' : 'transparent', border: `1px solid ${selected === i ? 'rgba(252,174,145,0.3)' : 'transparent'}`, transition: 'all 0.18s' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0, background: i === 0 ? 'linear-gradient(135deg,#f0c040,#f5a623)' : i === 1 ? 'rgba(252,174,145,0.3)' : 'rgba(26,26,26,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: i === 0 ? 'white' : i === 1 ? 'var(--accent)' : 'var(--text3)' }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{row.label}</span>
                    {row.badge && (
                      <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 6px', borderRadius: '20px', background: row.badge === 'ТОП' ? 'rgba(240,192,64,0.2)' : row.badge === 'РОСТ' ? 'rgba(91,171,114,0.2)' : 'rgba(252,174,145,0.2)', color: row.badge === 'ТОП' ? '#c68a00' : row.badge === 'РОСТ' ? '#4a8a52' : '#d06040' }}>{row.badge}</span>
                    )}
                  </div>
                  <ProgressBar value={barPct} height={3}/>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>{fmtK(row.revenue)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{row.count} прод. · {fmtRub(row.avg)}/шт</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" style={{ transform: selected === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {selected === i && (
                <div style={{ margin: '4px 0 8px', padding: '16px', background: 'rgba(252,174,145,0.05)', borderRadius: '10px', border: '1px solid rgba(252,174,145,0.15)', animation: 'fadeSlide 0.2s ease' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Покупатели</div>
                      {[
                        { label: 'Постоянные клиенты', pct: row.buyers.retPct, color: 'var(--accent)' },
                        { label: 'Новые клиенты',      pct: row.buyers.newPct, color: '#5BAB72' },
                      ].map(({ label, pct, color }) => (
                        <div key={label} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
                            <span style={{ fontSize: '11px', fontWeight: 800, color }}>{pct}%</span>
                          </div>
                          <ProgressBar value={pct} color={color} height={4}/>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Способ оплаты</div>
                      {row.payments.map(({ label, pct, color }) => (
                        <div key={label} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
                            <span style={{ fontSize: '11px', fontWeight: 800, color }}>{pct}%</span>
                          </div>
                          <ProgressBar value={pct} color={color} height={4}/>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Avg check + payment methods */}
      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Средний чек по дням</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100px' }}>
            {DAILY_CHECKS.map((v, i) => (
              <div key={i} style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                {hoveredCheck === i && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                    marginBottom: '4px', background: '#1A1A1A', color: '#fff',
                    fontSize: '10px', fontWeight: 700, padding: '3px 6px', borderRadius: '5px',
                    whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
                  }}>
                    ₽{v.toLocaleString('ru-RU')}
                  </div>
                )}
                <div style={{ width: '100%', borderRadius: '4px 4px 0 0', transition: 'all 0.2s', height: `${(v / maxCheck) * 100}%`, background: v === maxCheck ? 'var(--accent)' : v === Math.min(...DAILY_CHECKS) ? 'rgba(216,140,154,0.4)' : 'rgba(252,174,145,0.3)', cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredCheck(i)}
                  onMouseLeave={() => setHoveredCheck(null)}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {DAYS.map(d => (
              <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>{d}</div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Способы оплаты</div>
          {PAYMENT_METHODS.map(({ label, pct, color, val }) => (
            <div key={label} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 800 }}>{val} <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({pct}%)</span></span>
              </div>
              <ProgressBar value={pct} color={color} height={5}/>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
