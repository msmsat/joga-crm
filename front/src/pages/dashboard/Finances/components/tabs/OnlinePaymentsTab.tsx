import { useState } from 'react';
import type { ToastType } from '../../types';
import { ONLINE_CHANNELS_DATA, fmt } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import { Toggle } from '../ui/Toggle';
import styles from '../../Finances.module.css';

// ─── CANDLE TOOLTIP ───────────────────────────────────────────────────────────
function CandleTooltip({ data, visible, x, y }: { data: { label: string; val: number; txns: number; pct: number } | null; visible: boolean; x: number; y: number }) {
  if (!data || !visible) return null;
  return (
    <div style={{
      position: 'fixed', left: x + 12, top: y - 10, zIndex: 9999, pointerEvents: 'none',
      background: '#1A1A1A', borderRadius: '12px', padding: '12px 14px', minWidth: '160px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)', color: '#fff',
      animation: 'tooltipIn 0.15s ease',
    }}>
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{data.label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>{fmt(data.val)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {[
          { l: 'Транзакций', v: String(data.txns) },
          { l: 'vs прошлый',  v: `${data.pct >= 0 ? '+' : ''}${data.pct}%`, color: data.pct >= 0 ? '#A3C9A8' : '#D88C9A' },
        ].map(({ l, v, color }) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
            <span>{l}</span>
            <span style={{ fontWeight: 700, color: color || '#fff' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────
const DAY_MULTS   = [0.6,0.9,1.2,0.8,1.4,1.1,0.7,1.3,1.6,1.0,0.5,1.2,1.8,1.3,0.9,1.5,1.1,0.8,2.0,1.7];
const WEEK_MULTS  = [0.7,0.8,0.9,1.0,1.1,0.8,1.2,1.3,1.0,1.4,1.1,1.5,1.2,0.9,1.6,1.3,1.7,1.4,1.8,2.0];
const MONTH_MULTS = [0.4,0.5,0.7,0.6,0.9,1.1,1.4,1.2,1.5,1.8,2.1,2.5,0.8,1.0,1.3,1.6,1.9,2.2,2.0,1.7];
const MONTH_LABELS_20 = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек','Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг'];
const MOCK_TXNS  = [12,18,24,15,31,22,14,27,35,19,9,26,42,28,17,33,21,16,48,39];
const MOCK_PCTS  = [0,+14,-8,+5,+22,-6,+11,+18,-12,+8,-19,+31,-4,+16,+9,-7,+24,-3,+38,-9];

type ChartPoint = { label: string; val: number; txns: number; pct: number };

function getChartData(amount: number, isActive: boolean, period: string): ChartPoint[] {
  const zero = (labels: string[]) => labels.map((label, i) => ({ label, val: 0, txns: MOCK_TXNS[i], pct: MOCK_PCTS[i] }));
  if (!isActive || amount === 0) {
    if (period === 'День')   return zero(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    if (period === 'Неделя') return zero(Array.from({ length: 20 }, (_, i) => `Н${i + 1}`));
    return zero(MONTH_LABELS_20);
  }
  if (period === 'День') {
    const base = amount / 20;
    return DAY_MULTS.map((m, i) => ({ label: String(i + 1), val: Math.round(base * m), txns: MOCK_TXNS[i], pct: MOCK_PCTS[i] }));
  }
  if (period === 'Неделя') {
    const base = amount / 12;
    return WEEK_MULTS.map((m, i) => ({ label: `Н${i + 1}`, val: Math.round(base * m), txns: MOCK_TXNS[i], pct: MOCK_PCTS[i] }));
  }
  const base = amount / 10;
  return MONTH_MULTS.map((m, i) => ({ label: MONTH_LABELS_20[i], val: Math.round(base * m), txns: MOCK_TXNS[i], pct: MOCK_PCTS[i] }));
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function OnlinePaymentsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [channels, setChannels] = useState(ONLINE_CHANNELS_DATA);
  const [copied, setCopied] = useState(false);
  const [expandedChartId, setExpandedChartId] = useState<number | null>(null);
  const [chartPeriod, setChartPeriod] = useState('Месяц');

  const [candleHoveredIdx,  setCandleHoveredIdx]  = useState<number | null>(null);
  const [candleTooltipData, setCandleTooltipData] = useState<{ label: string; val: number; txns: number; pct: number } | null>(null);
  const [candleTooltipPos,  setCandleTooltipPos]  = useState({ x: 0, y: 0 });

  const toggle = (id: number) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
    showToast('Настройки шлюза обновлены', 'success');
  };

  const handleCopy = () => {
    setCopied(true);
    showToast('Ссылка скопирована в буфер', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const total    = channels.filter(c => c.active).reduce((s, c) => s + c.amount, 0);
  const sessions = channels.filter(c => c.active).reduce((s, c) => s + c.sessions, 0);

  const IconsMap: Record<string, React.ReactNode> = {
    link:     <Ico.World />,
    qr:       <Ico.QR />,
    widget:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    telegram: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>,
  };

  return (
    <>
      {/* 1. Главный блок */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.04)', marginBottom: '24px', overflow: 'hidden' }}>
        <div style={{ padding: '32px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-40px', right: '-20px', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(249,160,139,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
            <div style={{ zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 160, 139, 0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.World /></div>
                <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Суммарный онлайн-оборот</div>
              </div>
              <div style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-1.5px', color: '#1A1A1A', marginBottom: '6px' }}>{fmt(total)}</div>
              <div style={{ fontSize: '13px', color: '#666666', fontWeight: 500 }}>Обработано <span style={{ color: '#1A1A1A', fontWeight: 700 }}>{sessions}</span> платёжных сессий в этом месяце</div>
            </div>

            <svg width="180" height="110" viewBox="0 0 180 110" fill="none" style={{ zIndex: 2, overflow: 'visible' }}>
              <path d="M35 25 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M35 55 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M35 85 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M125 55 L165 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}><animateMotion dur="2.5s" repeatCount="indefinite" path="M35 25 L100 55" /></circle>
              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}><animateMotion dur="1.8s" repeatCount="indefinite" path="M35 55 L100 55" /></circle>
              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}><animateMotion dur="3.2s" repeatCount="indefinite" path="M35 85 L100 55" /></circle>
              <circle r="3" fill="#5BAB72" style={{ filter: 'drop-shadow(0 0 6px rgba(91,171,114,0.8))' }}><animateMotion dur="1.5s" repeatCount="indefinite" path="M125 55 L165 55" /></circle>
              <g><circle cx="25" cy="25" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="28" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>QR</text></g>
              <g><circle cx="25" cy="55" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="58" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>WEB</text></g>
              <g><circle cx="25" cy="85" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="88" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>TG</text></g>
              <circle cx="112" cy="55" r="22" fill="#FFFFFF" stroke="#F9A08B" strokeWidth="2" style={{ animation: 'pulseCore 2.5s infinite' }} />
              <text x="112" y="51" textAnchor="middle" style={{ fontSize: '12px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>₽</text>
              <text x="112" y="62" textAnchor="middle" style={{ fontSize: '7px', fill: '#999999', fontFamily: 'var(--font)', fontWeight: 600 }}>шлюз</text>
              <circle cx="170" cy="55" r="10" fill="rgba(91,171,114,0.15)" stroke="#5BAB72" strokeWidth="1.5" />
              <text x="170" y="58" textAnchor="middle" style={{ fontSize: '8.5px', fill: '#5BAB72', fontWeight: 800, fontFamily: 'var(--font)' }}>✓</text>
            </svg>
          </div>
        </div>

        <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(26,26,26,0.05)', background: '#FAFAFA', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#FFFFFF', borderRadius: '10px', padding: '6px 6px 6px 16px', border: '1px solid rgba(26,26,26,0.08)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ flex: 1, fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              pay.velora.studio/p/velora-pilates
            </div>
            <button
              onClick={handleCopy}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: copied ? '#A3C9A8' : '#1A1A1A', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)', fontFamily: "'Manrope', sans-serif" }}
            >
              {copied ? <><Ico.Check /> Скопировано</> : <><Ico.Copy /> Копировать</>}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Шлюзы */}
      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px', paddingLeft: '4px' }}>
        Управление шлюзами
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {channels.map(ch => {
          const isChartOpen = expandedChartId === ch.id;
          const chartData   = getChartData(ch.amount, ch.active, chartPeriod);
          const maxVal      = Math.max(...chartData.map(d => d.val), 1);

          return (
            <div
              key={ch.id}
              style={{
                padding: '24px', borderRadius: '16px',
                opacity: ch.active ? 1 : 0.6,
                background: ch.active ? '#FFFFFF' : 'rgba(26,26,26,0.01)',
                border: isChartOpen ? '1.5px solid #F9A08B' : (ch.active ? '1.5px solid rgba(26,26,26,0.15)' : '1.5px solid rgba(26,26,26,0.12)'),
                boxShadow: isChartOpen ? '0 16px 40px -8px rgba(249,160,139,0.15)' : (ch.active ? '0 8px 24px -4px rgba(26,26,26,0.04)' : 'none'),
                transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0, background: ch.active ? 'rgba(249, 160, 139, 0.12)' : 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ch.active ? '#F9A08B' : '#999999', transition: 'all 0.3s' }}>
                  {IconsMap[ch.icon]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '2px' }}>{ch.name}</div>
                  <div style={{ fontSize: '12px', color: '#666666', lineHeight: 1.4 }}>{ch.desc}</div>
                </div>
                <div style={{ textAlign: 'right', marginRight: '16px', flexShrink: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>{fmt(ch.amount)}</div>
                  <div style={{ fontSize: '11px', color: '#999999', fontWeight: 600 }}>{ch.sessions} сессий</div>
                </div>
                <button
                  onClick={() => ch.active && setExpandedChartId(isChartOpen ? null : ch.id)}
                  disabled={!ch.active}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: ch.active ? 'pointer' : 'not-allowed', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', marginRight: '16px', background: isChartOpen ? '#1A1A1A' : 'transparent', color: isChartOpen ? '#FFFFFF' : '#666666', border: isChartOpen ? '1px solid #1A1A1A' : '1px solid rgba(26,26,26,0.1)' }}
                  onMouseEnter={e => { if (ch.active && !isChartOpen) { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; } }}
                  onMouseLeave={e => { if (ch.active && !isChartOpen) { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; e.currentTarget.style.color = '#666666'; } }}
                >
                  <Ico.Bar /> Аналитика
                </button>
                <Toggle on={ch.active} onChange={() => toggle(ch.id)} />
              </div>

              {isChartOpen && (
                <div className={styles.chartContainerInner} style={{ borderTop: '1px dashed rgba(26,26,26,0.08)', marginTop: '24px' }}>
                  <div style={{ background: '#FAFAFA', borderRadius: '14px', border: '1px solid rgba(26,26,26,0.07)', padding: '20px 24px 16px', display: 'flex', flexDirection: 'column' }}>

                    {/* Заголовок */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>Выручка по периодам</div>
                      <div style={{ display: 'flex', gap: '3px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.06)', borderRadius: '9px', padding: '3px' }}>
                        {['Месяц', 'Неделя', 'День'].map(p => (
                          <button
                            key={p}
                            onClick={() => { setChartPeriod(p); setCandleHoveredIdx(null); setCandleTooltipData(null); }}
                            style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: chartPeriod === p ? '#FFFFFF' : 'transparent', color: chartPeriod === p ? '#1A1A1A' : '#666666', boxShadow: chartPeriod === p ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}
                          >{p}</button>
                        ))}
                      </div>
                    </div>

                    {/* Свечной график */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '180px', padding: '20px 0 0', position: 'relative' }}>
                      {[25, 50, 75, 100].map(pct => (
                        <div key={pct} style={{ position: 'absolute', left: 0, right: 0, bottom: `${pct}%`, height: '1px', background: 'rgba(26,26,26,0.05)', zIndex: 0, pointerEvents: 'none' }} />
                      ))}
                      {chartData.map((d, i) => {
                        const h        = (d.val / maxVal) * 100;
                        const isActive = candleHoveredIdx === i;
                        const isHigh   = d.val === maxVal && d.val > 0;
                        const bodyH    = d.val > 0 ? Math.max(h - 4, 8) : 0;
                        const wickTop  = d.val > 0 ? h + 4 : 0;
                        return (
                          <div
                            key={i}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative', zIndex: 1, cursor: d.val > 0 ? 'pointer' : 'default' }}
                            onMouseEnter={e => {
                              if (!d.val) return;
                              setCandleHoveredIdx(i);
                              setCandleTooltipData({ label: d.label, val: d.val, txns: d.txns, pct: d.pct });
                              setCandleTooltipPos({ x: e.clientX, y: e.clientY });
                            }}
                            onMouseMove={e => setCandleTooltipPos({ x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => { setCandleHoveredIdx(null); setCandleTooltipData(null); }}
                          >
                            {/* Фитиль */}
                            {d.val > 0 && (
                              <div style={{ width: '2px', background: isActive ? 'var(--accent)' : 'rgba(252,174,145,0.4)', height: `${wickTop}%`, position: 'absolute', bottom: 0, borderRadius: '2px', transition: 'all 0.2s' }} />
                            )}
                            {/* Тело свечи */}
                            {d.val > 0 && (
                              <div style={{ width: '100%', maxWidth: '18px', height: `${bodyH}%`, position: 'absolute', bottom: 0, background: isActive ? 'linear-gradient(180deg,var(--accent) 0%,#F5866E 100%)' : isHigh ? 'linear-gradient(180deg,rgba(252,174,145,0.9) 0%,rgba(249,160,139,0.6) 100%)' : 'rgba(252,174,145,0.3)', borderRadius: '4px 4px 2px 2px', transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)', transform: isActive ? 'scaleX(1.05)' : 'none', boxShadow: isActive ? '0 4px 14px rgba(252,174,145,0.5)' : 'none' }} />
                            )}
                            {/* Число над свечой */}
                            {isActive && d.val > 0 && (
                              <div style={{ position: 'absolute', bottom: `calc(${bodyH}% + 6px)`, left: '50%', transform: 'translateX(-50%)', fontSize: '9px', fontWeight: 800, color: '#1A1A1A', whiteSpace: 'nowrap', animation: 'fadeSlide 0.15s ease', pointerEvents: 'none' }}>
                                {fmt(d.val)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Подписи периодов */}
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                      {chartData.map((d, i) => (
                        <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '9px', color: candleHoveredIdx === i ? 'var(--accent)' : 'rgba(26,26,26,0.3)', fontWeight: candleHoveredIdx === i ? 700 : 500, transition: 'all 0.15s' }}>{d.label}</div>
                      ))}
                    </div>

                    <CandleTooltip data={candleTooltipData} visible={candleHoveredIdx !== null} x={candleTooltipPos.x} y={candleTooltipPos.y} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
