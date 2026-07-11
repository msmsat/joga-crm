import { useState } from 'react';
import type { ToastType } from '../../types';
import { fmt, LINE_DATA } from '../../constants';
import type { LinePoint } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import { Btn } from '../ui/Btn';
import styles from '../../Finances.module.css';

// ─── SVG LINE CHART HELPERS ───────────────────────────────────────────────────
const SVG_W = 600;
const SVG_H = 160;
const PAD_T = 10;
const PAD_B = 8;

function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const x0 = pts[i - 1].x, y0 = pts[i - 1].y;
    const x1 = pts[i].x,     y1 = pts[i].y;
    const dx = (x1 - x0) * 0.4;
    d += ` C ${(x0 + dx).toFixed(1)} ${y0.toFixed(1)}, ${(x1 - dx).toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ReportsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [period, setPeriod] = useState('Месяц');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [breakdownView, setBreakdownView] = useState<'income' | 'expense'>('expense');
  const [hoveredSeg, setHoveredSegment] = useState<number | null>(null);
  const [donutMouse, setDonutMouse] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart]   = useState<number | null>(null);
  const [selRange, setSelRange]     = useState<[number, number] | null>(null);

  const lineData: LinePoint[] = LINE_DATA[period] ?? LINE_DATA['Месяц'];
  const n = lineData.length;

  // Y-scale: from 0 to maxY
  const allVals = lineData.flatMap(d => [d.income, d.expense]);
  const maxY = Math.max(...allVals);

  const toX = (i: number) => (i / (n - 1)) * SVG_W;
  const toY = (v: number) => PAD_T + (1 - v / maxY) * (SVG_H - PAD_T - PAD_B);

  const incPts = lineData.map((d, i) => ({ x: toX(i), y: toY(d.income) }));
  const expPts = lineData.map((d, i) => ({ x: toX(i), y: toY(d.expense) }));

  const incLinePath = smoothPath(incPts);
  const expLinePath = smoothPath(expPts);

  const last    = incPts[incPts.length - 1];
  const expLast = expPts[expPts.length - 1];
  const incFillPath = `${incLinePath} L ${last.x.toFixed(1)} ${SVG_H} L ${incPts[0].x.toFixed(1)} ${SVG_H} Z`;
  const expFillPath = `${expLinePath} L ${expLast.x.toFixed(1)} ${SVG_H} L ${expPts[0].x.toFixed(1)} ${SVG_H} Z`;

  // Selection derived values
  const isSelection = selRange !== null;
  const selMin = isSelection ? Math.min(...selRange!) : 0;
  const selMax = isSelection ? Math.max(...selRange!) : 0;
  const selX1  = toX(selMin);
  const selX2  = toX(selMax);
  const selData   = isSelection ? lineData.slice(selMin, selMax + 1) : null;
  const selIncUp  = isSelection && lineData[selRange![1]].income  >= lineData[selRange![0]].income;
  const selExpUp  = isSelection && lineData[selRange![1]].expense >= lineData[selRange![0]].expense;

  // Stats: hovered point or last point; summed when selection active
  const activeIdx  = hoveredIdx ?? n - 1;
  const cur  = lineData[activeIdx];
  const prev = lineData[Math.max(activeIdx - 1, 0)];

  const dispIncome  = isSelection ? selData!.reduce((s, d) => s + d.income,  0) : cur.income;
  const dispExpense = isSelection ? selData!.reduce((s, d) => s + d.expense, 0) : cur.expense;
  const dispProfit  = dispIncome - dispExpense;

  const dateLabel = isSelection
    ? `${lineData[selMin].label} – ${lineData[selMax].label}`
    : cur.label;

  // Deltas (shown only when no selection active)
  const incDelta       = cur.income  - prev.income;
  const incDeltaPct    = prev.income  ? Math.round((incDelta  / prev.income)  * 100) : 0;
  const expDelta       = cur.expense - prev.expense;
  const expDeltaPct    = prev.expense ? Math.round((expDelta / prev.expense) * 100) : 0;
  const profit         = cur.income  - cur.expense;
  const prevProfit     = prev.income - prev.expense;
  const profitDelta    = profit - prevProfit;
  const profitDeltaPct = prevProfit ? Math.round((profitDelta / prevProfit) * 100) : 0;

  // X-label step: show ~6 labels
  const labelStep = Math.max(1, Math.floor(n / 6));

  // SVG coord → point index
  const svgToIdx = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(Math.max(Math.round((e.clientX - r.left) / r.width * (n - 1)), 0), n - 1);
  };

  // ─── Breakdown data ───────────────────────────────────────────────────────
  const expensesData = [
    { id: 1, label: 'Зарплата команды',            value: 120000, color: '#D88C9A' },
    { id: 2, label: 'Аренда помещения',             value: 80000,  color: '#E8A0B0' },
    { id: 3, label: 'Маркетинг и реклама',          value: 35000,  color: '#F0B4C0' },
    { id: 4, label: 'Налоги и взносы',              value: 15000,  color: '#F8C8D0' },
  ];
  const incomeData = [
    { id: 1, label: 'Абонементы',                  value: 250000, color: '#5BAB72' },
    { id: 2, label: 'Разовые визиты',               value: 120000, color: '#7AA080' },
    { id: 3, label: 'Продажа товаров (Вода, Мерч)', value: 45000,  color: '#9AB5A0' },
    { id: 4, label: 'Сдача в субаренду',            value: 67000,  color: '#B5C9B8' },
  ];

  const currentBreakdown = breakdownView === 'expense' ? expensesData : incomeData;
  const breakdownTotal   = currentBreakdown.reduce((s, i) => s + i.value, 0);

  const renderDonut = () => {
    const r = 54, circ = 2 * Math.PI * r;
    let offset = 0;
    return (
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.06))' }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(26,26,26,0.03)" strokeWidth="22" />
        {currentBreakdown.map(item => {
          const pct = item.value / breakdownTotal;
          const dash = pct * circ, gap = circ - dash;
          const isHovered = hoveredSeg === item.id;
          const el = (
            <circle
              key={item.id} cx="80" cy="80" r={r} fill="none" stroke={item.color}
              strokeWidth={isHovered ? 26 : 22} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset * circ}
              strokeLinecap="round"
              style={{ transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)', cursor: 'pointer', opacity: hoveredSeg === null || hoveredSeg === item.id ? 1 : 0.3 }}
              onMouseEnter={() => setHoveredSegment(item.id)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          );
          offset += pct;
          return el;
        })}
      </svg>
    );
  };

  return (
    <>
      {/* 1. Метрики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Выручка',        value: '₽482 000', delta: '+12%',    good: true,  c1: '#A3C9A8', c2: 'rgba(163,201,168,0.15)', icon: <Ico.Up /> },
          { label: 'Расходы',        value: '₽118 000', delta: '-4%',     good: true,  c1: '#D88C9A', c2: 'rgba(216,140,154,0.15)', icon: <Ico.Down /> },
          { label: 'Прибыль',        value: '₽364 000', delta: '+18%',    good: true,  c1: '#F9A08B', c2: 'rgba(249,160,139,0.15)', icon: <Ico.Dollar /> },
          { label: 'Рентабельность', value: '75.5%',    delta: '+3.2pp',  good: true,  c1: '#7EB5D6', c2: 'rgba(126,181,214,0.15)', icon: <Ico.Target /> },
        ].map(m => (
          <div key={m.label} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-15px', right: '-15px', width: '80px', height: '80px', background: `radial-gradient(circle, ${m.c2} 0%, transparent 70%)`, borderRadius: '50%' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{m.label}</div>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: m.c2, color: m.c1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.icon}</div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', color: '#1A1A1A', marginBottom: '8px' }}>{m.value}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: m.good ? '#5BAB72' : '#D88C9A', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ padding: '2px 6px', background: m.good ? 'rgba(91,171,114,0.1)' : 'rgba(216,140,154,0.1)', borderRadius: '6px' }}>{m.delta}</span> к прошлому периоду
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', marginBottom: '24px', alignItems: 'start' }}>
        {/* 2. Линейный график движения средств */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', padding: '28px', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: '12px', marginBottom: '20px', gap: '12px' }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px', marginBottom: '4px' }}>Движение средств</div>
              <div style={{ fontSize: '12px', color: '#666666', fontWeight: 500 }}>Анализ доходов и расходов</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: '10px' }}>
              {/* Мини-статистика */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', paddingRight: '16px', borderRight: '1px solid rgba(26,26,26,0.07)' }}>

                {/* Период / дата */}
                <div style={{ paddingRight: '12px', borderRight: '1px solid rgba(26,26,26,0.06)', minWidth: '70px' }}>
                  <div style={{ fontSize: '10px', color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Период</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#AAAAAA', whiteSpace: 'nowrap' }}>{dateLabel}</div>
                </div>

                {/* Доход */}
                <div style={{ minWidth: '76px' }}>
                  <div style={{ fontSize: '10px', color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Доход</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(dispIncome)}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: incDelta >= 0 ? '#5BAB72' : '#D88C9A', visibility: isSelection ? 'hidden' : 'visible' }}>
                    {incDelta >= 0 ? '+' : '-'}{fmt(Math.abs(incDelta))} ({incDelta >= 0 ? '+' : ''}{incDeltaPct}%)
                  </div>
                </div>

                {/* Расход */}
                <div style={{ minWidth: '76px' }}>
                  <div style={{ fontSize: '10px', color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Расход</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(dispExpense)}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: expDelta >= 0 ? '#D88C9A' : '#5BAB72', visibility: isSelection ? 'hidden' : 'visible' }}>
                    {expDelta >= 0 ? '+' : '-'}{fmt(Math.abs(expDelta))} ({expDelta >= 0 ? '+' : ''}{expDeltaPct}%)
                  </div>
                </div>

                {/* Прибыль */}
                <div style={{ minWidth: '76px' }}>
                  <div style={{ fontSize: '10px', color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Прибыль</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(dispProfit)}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: profitDelta >= 0 ? '#5BAB72' : '#D88C9A', visibility: isSelection ? 'hidden' : 'visible' }}>
                    {profitDelta >= 0 ? '+' : '-'}{fmt(Math.abs(profitDelta))} ({profitDelta >= 0 ? '+' : ''}{profitDeltaPct}%)
                  </div>
                </div>
              </div>

              {/* Кнопки периода */}
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.04)', borderRadius: '10px', padding: '4px', flexShrink: 0 }}>
                {['Месяц', 'Неделя', 'День'].map(p => (
                  <button
                    key={p}
                    onClick={() => { setPeriod(p); setHoveredIdx(null); setSelRange(null); }}
                    style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: period === p ? '#FFFFFF' : 'transparent', color: period === p ? '#1A1A1A' : '#666666', boxShadow: period === p ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}
                  >{p}</button>
                ))}
              </div>
            </div>
          </div>

          {/* SVG Chart: высота ограничена clamp'ом, а не высотой соседней карточки */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 'clamp(180px, 30vh, 320px)', position: 'relative' }}>
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', cursor: dragStart !== null ? 'col-resize' : 'crosshair', userSelect: 'none' }}
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                preserveAspectRatio="none"
                onMouseDown={e => { setDragStart(svgToIdx(e)); setSelRange(null); }}
                onMouseMove={e => {
                  const i = svgToIdx(e);
                  if (dragStart !== null) setSelRange([dragStart, i]);
                  else setHoveredIdx(i);
                }}
                onMouseUp={() => { setSelRange(null); setDragStart(null); }}
                onMouseLeave={() => { setHoveredIdx(null); setDragStart(null); setSelRange(null); }}
              >
                <defs>
                  <linearGradient id="lg-inc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5BAB72" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#5BAB72" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="lg-exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D88C9A" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#D88C9A" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="lg-inc-up" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5BAB72" stopOpacity="0.90" />
                    <stop offset="100%" stopColor="#5BAB72" stopOpacity="0.10" />
                  </linearGradient>
                  <linearGradient id="lg-inc-dn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D88C9A" stopOpacity="0.76" />
                    <stop offset="100%" stopColor="#D88C9A" stopOpacity="0.08" />
                  </linearGradient>
                  <linearGradient id="lg-exp-up" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D88C9A" stopOpacity="0.76" />
                    <stop offset="100%" stopColor="#D88C9A" stopOpacity="0.08" />
                  </linearGradient>
                  <linearGradient id="lg-exp-dn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5BAB72" stopOpacity="0.76" />
                    <stop offset="100%" stopColor="#5BAB72" stopOpacity="0.08" />
                  </linearGradient>
                  {isSelection && (
                    <clipPath id="clip-sel">
                      <rect x={selX1} y={0} width={selX2 - selX1} height={SVG_H} />
                    </clipPath>
                  )}
                </defs>

                {/* Горизонтальные линии сетки */}
                {[0.25, 0.5, 0.75].map(f => {
                  const gy = PAD_T + f * (SVG_H - PAD_T - PAD_B);
                  return <line key={f} x1={0} y1={gy} x2={SVG_W} y2={gy} stroke="rgba(26,26,26,0.05)" strokeWidth={1} />;
                })}

                {/* Заливка под линиями */}
                <path d={incFillPath} fill="url(#lg-inc)" style={{ transition: 'd 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                <path d={expFillPath} fill="url(#lg-exp)" style={{ transition: 'd 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                {isSelection && (
                  <>
                    <path d={incFillPath} fill={`url(#lg-inc-${selIncUp ? 'up' : 'dn'})`} clipPath="url(#clip-sel)" />
                    <path d={expFillPath} fill={`url(#lg-exp-${selExpUp ? 'up' : 'dn'})`} clipPath="url(#clip-sel)" />
                  </>
                )}

                {/* Линии */}
                <path d={incLinePath} fill="none" stroke="#5BAB72" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'd 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                <path d={expLinePath} fill="none" stroke="#D88C9A" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'd 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />

                {/* Selection: two vertical boundary lines */}
                {isSelection && (
                  <>
                    <line x1={selX1} y1={0} x2={selX1} y2={SVG_H} stroke="rgba(26,26,26,0.3)" strokeWidth={1}/>
                    <line x1={selX2} y1={0} x2={selX2} y2={SVG_H} stroke="rgba(26,26,26,0.3)" strokeWidth={1}/>
                  </>
                )}

                {/* Hover: вертикальная линия */}
                {hoveredIdx !== null && (
                  <line x1={toX(hoveredIdx)} y1={PAD_T} x2={toX(hoveredIdx)} y2={SVG_H} stroke="rgba(26,26,26,0.12)" strokeWidth={1} strokeDasharray="3,3" />
                )}
              </svg>

              {/* Hover dots — HTML divs so border-radius:50% is always a perfect circle */}
              {hoveredIdx !== null && (() => {
                const leftPct = (toX(hoveredIdx) / SVG_W) * 100;
                const incTopPct = (incPts[hoveredIdx].y / SVG_H) * 100;
                const expTopPct = (expPts[hoveredIdx].y / SVG_H) * 100;
                const dot = (color: string, top: number): React.CSSProperties => ({
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${top}%`,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  boxShadow: '0 0 0 2px #fff, 0 0 0 3.5px rgba(26,26,26,0.22)',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                });
                return (
                  <>
                    <div style={dot('#5BAB72', incTopPct)} />
                    <div style={dot('#D88C9A', expTopPct)} />
                  </>
                );
              })()}

              {/* Selection change labels — right edge, aligned to line endpoint */}
              {isSelection && (() => {
                const s = selRange![0], e = selRange![1];
                const incChange = lineData[e].income  - lineData[s].income;
                const expChange = lineData[e].expense - lineData[s].expense;
                const incPct    = lineData[s].income  ? (incChange / lineData[s].income)  * 100 : 0;
                const expPct    = lineData[s].expense ? (expChange / lineData[s].expense) * 100 : 0;
                const incTopPct = (incPts[e].y / SVG_H) * 100;
                const expTopPct = (expPts[e].y / SVG_H) * 100;

                const label = (change: number, pct: number, topPct: number) => {
                  const color = change >= 0 ? '#5BAB72' : '#D88C9A';
                  const sign  = change >= 0 ? '+' : '−';
                  return (
                    <div style={{ position: 'absolute', right: 4, top: `${topPct}%`, transform: 'translateY(-50%)', pointerEvents: 'none', textAlign: 'right', lineHeight: 1.3 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap', fontFamily: 'Manrope, Inter, sans-serif' }}>
                        {sign}{Math.abs(change).toLocaleString('ru-RU')} ₽
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 500, color, whiteSpace: 'nowrap', fontFamily: 'Manrope, Inter, sans-serif' }}>
                        {sign}{Math.abs(pct).toFixed(1)}%
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {label(incChange, incPct, incTopPct)}
                    {label(expChange, expPct, expTopPct)}
                  </>
                );
              })()}
            </div>

            {/* X-метки */}
            <div style={{ display: 'flex', marginTop: '6px', flexShrink: 0 }}>
              {lineData.map((d, i) => {
                const show = i % labelStep === 0 || i === n - 1;
                return (
                  <div
                    key={i}
                    style={{ flex: 1, textAlign: 'center', fontSize: '9px', color: hoveredIdx === i ? '#1A1A1A' : '#CCCCCC', fontWeight: hoveredIdx === i ? 700 : 500, transition: 'color 0.15s', whiteSpace: 'nowrap', overflow: 'hidden' }}
                  >
                    {show ? d.label : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer legend */}
          <div style={{ display: 'flex', gap: '20px', paddingTop: '16px', borderTop: '1px solid rgba(26,26,26,0.04)', marginTop: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#666666' }}>
              <div style={{ width: '14px', height: '3px', borderRadius: '2px', background: '#5BAB72' }} /> Доходы
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#666666' }}>
              <div style={{ width: '14px', height: '3px', borderRadius: '2px', background: '#D88C9A' }} /> Расходы
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Btn size="sm" onClick={() => showToast('Отчёт экспортируется...', 'info')}><Ico.Download /> Экспорт PDF</Btn>
            </div>
          </div>
        </div>

        {/* 3. Детализация (Breakdown) */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', padding: '28px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.12)', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
            <button onClick={() => setBreakdownView('expense')} style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: breakdownView === 'expense' ? '#FFFFFF' : 'transparent', color: breakdownView === 'expense' ? '#1A1A1A' : '#666666', boxShadow: breakdownView === 'expense' ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>Структура расходов</button>
            <button onClick={() => setBreakdownView('income')}  style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: breakdownView === 'income'  ? '#FFFFFF' : 'transparent', color: breakdownView === 'income'  ? '#1A1A1A' : '#666666', boxShadow: breakdownView === 'income'  ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>Структура доходов</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px', position: 'relative' }} onMouseMove={e => setDonutMouse({ x: e.clientX, y: e.clientY })}>
            {renderDonut()}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#999999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Всего</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.5px' }}>{fmt(breakdownTotal)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
            {currentBreakdown.map(item => {
              const isHovered = hoveredSeg === item.id;
              const pct = Math.round((item.value / breakdownTotal) * 100);
              return (
                <div
                  key={item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', background: isHovered ? 'rgba(26,26,26,0.02)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid', borderColor: isHovered ? 'rgba(26,26,26,0.06)' : 'transparent' }}
                  onMouseEnter={() => setHoveredSegment(item.id)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: item.color, flexShrink: 0, transform: isHovered ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.2s' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{item.label}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A' }}>{fmt(item.value)}</div>
                    <div style={{ fontSize: '11px', color: '#999999', fontWeight: 600 }}>{pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {hoveredSeg !== null && (() => {
        const item = currentBreakdown.find(i => i.id === hoveredSeg);
        if (!item) return null;
        const pct = Math.round(item.value / breakdownTotal * 100);
        return (
          <div style={{ position: 'fixed', left: donutMouse.x + 14, top: donutMouse.y - 36, background: '#111111', color: '#FFFFFF', padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', lineHeight: 1.5 }}>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginBottom: '2px' }}>{item.label}</div>
            <span style={{ color: item.color }}>{fmt(item.value)}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}> — {pct}%</span>
          </div>
        );
      })()}

      {/* 4. Smart Insights */}
      <div className={styles.insightCard}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #F9A08B 0%, #FCAE91 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', flexShrink: 0, boxShadow: '0 8px 24px rgba(249,160,139,0.3)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>Финансовая сводка и инсайты</div>
            <div style={{ fontSize: '13px', color: '#666666', lineHeight: 1.6 }}>
              Отличный месяц! Ваша <strong>чистая прибыль выросла на 18%</strong>. Мы заметили, что доля оплат абонементов онлайн увеличилась в 2 раза по сравнению с прошлым кварталом. При этом расходы на аренду и зарплату остались в пределах нормы (менее 50% от выручки). Рекомендуем рассмотреть создание резервного фонда.
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
              <span style={{ display: 'inline-flex', padding: '4px 10px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(249,160,139,0.2)', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#F9A08B' }}>Совет: Открыть копилку</span>
              <span style={{ display: 'inline-flex', padding: '4px 10px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(249,160,139,0.2)', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#F9A08B' }}>Посмотреть план расходов</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
