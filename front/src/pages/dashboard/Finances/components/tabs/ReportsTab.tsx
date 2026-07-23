import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastType } from '../../types';
import { Ico } from '../ui/FinanceIcons';
import { Btn } from '../ui/Btn';
import styles from '../../Finances.module.css';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../components/UI';
import { InfoHint } from '../../../../../components/ui/InfoHint';
import { financesApi } from '../../../../../api/finances/finances.api';
import { useReportSummary, useReportSeries, useReportBreakdown } from '../../hooks/useFinances';
import { PeriodDropdown } from '../ui/PeriodDropdown';
import i18n from '../../../../../i18n';

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

// ─── PERIOD HELPERS ────────────────────────────────────────────────────────────
type PeriodPreset = 'today' | 'week' | 'month' | 'year';
const PERIOD_DAYS_BACK: Record<PeriodPreset, number> = { today: 0, week: 7, month: 30, year: 365 };
const PERIOD_GROUP: Record<PeriodPreset, 'day' | 'month'> = { today: 'day', week: 'day', month: 'day', year: 'month' };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function periodToRange(preset: PeriodPreset): { date_from: string; date_to: string; group: 'day' | 'month' } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - PERIOD_DAYS_BACK[preset]);
  return { date_from: isoDate(from), date_to: isoDate(to), group: PERIOD_GROUP[preset] };
}
function formatSeriesLabel(period: string, group: 'day' | 'month'): string {
  const d = new Date(period);
  if (group === 'month') return d.toLocaleDateString(i18n.language, { month: 'short', year: '2-digit' });
  return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ReportsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const { t } = useTranslation('finances');
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [breakdownView, setBreakdownView] = useState<'income' | 'expense'>('expense');
  const [hoveredSeg, setHoveredSegment] = useState<number | null>(null);
  const [donutMouse, setDonutMouse] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart]   = useState<number | null>(null);
  const [selRange, setSelRange]     = useState<[number, number] | null>(null);
  const [exporting, setExporting]   = useState(false);

  const { date_from: dateFrom, date_to: dateTo, group } = periodToRange(preset);

  const { data: summary, isLoading: summaryLoading } = useReportSummary(dateFrom, dateTo);
  const { data: revenueSeries = [], isLoading: revenueLoading } = useReportSeries('revenue', group, dateFrom, dateTo);
  const { data: expenseSeries = [] } = useReportSeries('expenses', group, dateFrom, dateTo);
  const { data: breakdown = [], isLoading: breakdownLoading } = useReportBreakdown(
    breakdownView === 'expense' ? 'out' : 'in', dateFrom, dateTo,
  );

  const loading = summaryLoading || revenueLoading;

  // Серии выручки/расходов объединяем по периоду (бэкенд группирует оба одинаково для одного диапазона).
  const periods = Array.from(new Set([...revenueSeries.map(p => p.period), ...expenseSeries.map(p => p.period)])).sort();
  const revenueByPeriod = new Map(revenueSeries.map(p => [p.period, p.value]));
  const expenseByPeriod = new Map(expenseSeries.map(p => [p.period, p.value]));
  const lineData = periods.map(period => ({
    label: formatSeriesLabel(period, group),
    income: revenueByPeriod.get(period) ?? 0,
    expense: expenseByPeriod.get(period) ?? 0,
  }));
  const n = lineData.length;
  const hasSeriesData = n > 0 && lineData.some(d => d.income > 0 || d.expense > 0);

  // Y-scale: from 0 to maxY (guard: пустая серия/все нули → maxY=1, чтобы не делить на 0)
  const allVals = lineData.flatMap(d => [d.income, d.expense]);
  const maxY = Math.max(1, ...allVals);

  const toX = (i: number) => n > 1 ? (i / (n - 1)) * SVG_W : 0;
  const toY = (v: number) => PAD_T + (1 - v / maxY) * (SVG_H - PAD_T - PAD_B);

  const incPts = lineData.map((d, i) => ({ x: toX(i), y: toY(d.income) }));
  const expPts = lineData.map((d, i) => ({ x: toX(i), y: toY(d.expense) }));

  const incLinePath = smoothPath(incPts);
  const expLinePath = smoothPath(expPts);

  const last    = incPts[incPts.length - 1];
  const expLast = expPts[expPts.length - 1];
  const incFillPath = last ? `${incLinePath} L ${last.x.toFixed(1)} ${SVG_H} L ${incPts[0].x.toFixed(1)} ${SVG_H} Z` : '';
  const expFillPath = expLast ? `${expLinePath} L ${expLast.x.toFixed(1)} ${SVG_H} L ${expPts[0].x.toFixed(1)} ${SVG_H} Z` : '';

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
  const cur  = hasSeriesData ? lineData[activeIdx] : { label: '—', income: 0, expense: 0 };
  const prev = hasSeriesData ? lineData[Math.max(activeIdx - 1, 0)] : { label: '—', income: 0, expense: 0 };

  const dispIncome  = isSelection ? selData!.reduce((s, d) => s + d.income,  0) : cur.income;
  const dispExpense = isSelection ? selData!.reduce((s, d) => s + d.expense, 0) : cur.expense;
  const dispProfit  = dispIncome - dispExpense;

  const dateLabel = !hasSeriesData ? '—' : isSelection
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

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await financesApi.exportOperations({ date_from: dateFrom, date_to: dateTo });
    } catch {
      showToast(t('reports.toasts.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  // ─── Metrics ────────────────────────────────────────────────────────────────
  const revenue = summary?.revenue ?? 0;
  const expenses = summary?.expenses ?? 0;
  const profitTotal = summary?.profit ?? 0;
  const margin = revenue ? (profitTotal / revenue) * 100 : 0;

  const fmtDelta = (pct: number | null | undefined) => pct == null ? null : `${pct >= 0 ? '+' : ''}${pct}%`;
  const metrics = [
    { label: t('reports.metrics.revenue'), value: fmt(revenue), delta: fmtDelta(summary?.trends.revenue_pct), good: (summary?.trends.revenue_pct ?? 0) >= 0, c1: '#A3C9A8', c2: 'rgba(163,201,168,0.15)', icon: <Ico.Up /> },
    { label: t('reports.metrics.expenses'), value: fmt(expenses), delta: fmtDelta(summary?.trends.expenses_pct), good: (summary?.trends.expenses_pct ?? 0) <= 0, c1: '#D88C9A', c2: 'rgba(216,140,154,0.15)', icon: <Ico.Down /> },
    { label: t('reports.metrics.profit'), value: fmt(profitTotal), delta: null, good: profitTotal >= 0, c1: '#F9A08B', c2: 'rgba(249,160,139,0.15)', icon: <Ico.Dollar /> },
    { label: t('reports.metrics.margin'), value: `${margin.toFixed(1)}%`, delta: null, good: margin >= 0, c1: '#7EB5D6', c2: 'rgba(126,181,214,0.15)', icon: <Ico.Target /> },
  ];

  // ─── Breakdown data ───────────────────────────────────────────────────────
  const BREAKDOWN_COLORS = breakdownView === 'expense'
    ? ['#D88C9A', '#E8A0B0', '#F0B4C0', '#F8C8D0', '#FBD8DE']
    : ['#5BAB72', '#7AA080', '#9AB5A0', '#B5C9B8', '#CADACC'];
  const categoryLabel = (key: string) => key === 'other' ? t('reports.otherCategory') : key;
  const currentBreakdown = breakdown.map((b, i) => ({
    id: i,
    label: categoryLabel(b.category),
    value: b.amount,
    color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
  }));
  const breakdownTotal = currentBreakdown.reduce((s, i) => s + i.value, 0);

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

  const emptyState = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '180px', color: '#999999', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}>
      {label}
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1A1A1A' }}>{t('tabs.reports')}</div>
        <InfoHint title={t('tabs.reports')} text={t('info.reports')} />
      </div>

      {/* 1. Метрики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-15px', right: '-15px', width: '80px', height: '80px', background: `radial-gradient(circle, ${m.c2} 0%, transparent 70%)`, borderRadius: '50%' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{m.label}</div>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: m.c2, color: m.c1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.icon}</div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', color: '#1A1A1A', marginBottom: '8px' }}>{loading ? '—' : m.value}</div>
            {m.delta && (
              <div style={{ fontSize: '12px', fontWeight: 700, color: m.good ? '#5BAB72' : '#D88C9A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ padding: '2px 6px', background: m.good ? 'rgba(91,171,114,0.1)' : 'rgba(216,140,154,0.1)', borderRadius: '6px' }}>{m.delta}</span> {t('reports.vsPreviousPeriod')}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', marginBottom: '24px', alignItems: 'start' }}>
        {/* 2. Линейный график движения средств */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', padding: '28px', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: '12px', marginBottom: '20px', gap: '12px' }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px', marginBottom: '4px' }}>{t('reports.cashflowTitle')}</div>
              <div style={{ fontSize: '12px', color: '#666666', fontWeight: 500 }}>{t('reports.cashflowSub')}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: '10px' }}>
              {/* Мини-статистика */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', paddingRight: '16px', borderRight: '1px solid rgba(26,26,26,0.07)' }}>

                {/* Период / дата */}
                <div style={{ paddingRight: '12px', borderRight: '1px solid rgba(26,26,26,0.06)', minWidth: '70px' }}>
                  <div style={{ fontSize: '10px', color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{t('reports.period')}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#AAAAAA', whiteSpace: 'nowrap' }}>{dateLabel}</div>
                </div>

                {/* Доход */}
                <div style={{ minWidth: '76px' }}>
                  <div style={{ fontSize: '10px', color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{t('reports.income')}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(dispIncome)}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: incDelta >= 0 ? '#5BAB72' : '#D88C9A', visibility: isSelection ? 'hidden' : 'visible' }}>
                    {incDelta >= 0 ? '+' : '-'}{fmt(Math.abs(incDelta))} ({incDelta >= 0 ? '+' : ''}{incDeltaPct}%)
                  </div>
                </div>

                {/* Расход */}
                <div style={{ minWidth: '76px' }}>
                  <div style={{ fontSize: '10px', color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{t('reports.expense')}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(dispExpense)}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: expDelta >= 0 ? '#D88C9A' : '#5BAB72', visibility: isSelection ? 'hidden' : 'visible' }}>
                    {expDelta >= 0 ? '+' : '-'}{fmt(Math.abs(expDelta))} ({expDelta >= 0 ? '+' : ''}{expDeltaPct}%)
                  </div>
                </div>

                {/* Прибыль */}
                <div style={{ minWidth: '76px' }}>
                  <div style={{ fontSize: '10px', color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{t('reports.profit')}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(dispProfit)}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: profitDelta >= 0 ? '#5BAB72' : '#D88C9A', visibility: isSelection ? 'hidden' : 'visible' }}>
                    {profitDelta >= 0 ? '+' : '-'}{fmt(Math.abs(profitDelta))} ({profitDelta >= 0 ? '+' : ''}{profitDeltaPct}%)
                  </div>
                </div>
              </div>

              <PeriodDropdown
                value={preset}
                options={(['today', 'week', 'month', 'year'] as const).map(p => ({ value: p, label: t(`reports.periods.${p}`) }))}
                onChange={v => { setPreset(v as PeriodPreset); setHoveredIdx(null); setSelRange(null); }}
              />
            </div>
          </div>

          {/* SVG Chart: высота ограничена clamp'ом, а не высотой соседней карточки */}
          {!loading && !hasSeriesData ? emptyState(t('reports.noData')) : (
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
                        {sign}{fmt(Math.abs(change))}
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
          )}

          {/* Footer legend */}
          <div style={{ display: 'flex', gap: '20px', paddingTop: '16px', borderTop: '1px solid rgba(26,26,26,0.04)', marginTop: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#666666' }}>
              <div style={{ width: '14px', height: '3px', borderRadius: '2px', background: '#5BAB72' }} /> {t('reports.legendIncome')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#666666' }}>
              <div style={{ width: '14px', height: '3px', borderRadius: '2px', background: '#D88C9A' }} /> {t('reports.legendExpense')}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Btn size="sm" disabled={exporting} onClick={handleExport}><Ico.Download /> {exporting ? t('common.loading') : t('reports.exportCsv')}</Btn>
            </div>
          </div>
        </div>

        {/* 3. Детализация (Breakdown) */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', padding: '28px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.12)', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
            <button onClick={() => setBreakdownView('expense')} style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: breakdownView === 'expense' ? '#FFFFFF' : 'transparent', color: breakdownView === 'expense' ? '#1A1A1A' : '#666666', boxShadow: breakdownView === 'expense' ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>{t('reports.expenseStructure')}</button>
            <button onClick={() => setBreakdownView('income')}  style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: breakdownView === 'income'  ? '#FFFFFF' : 'transparent', color: breakdownView === 'income'  ? '#1A1A1A' : '#666666', boxShadow: breakdownView === 'income'  ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>{t('reports.incomeStructure')}</button>
          </div>

          {!breakdownLoading && breakdownTotal === 0 ? emptyState(t('reports.noData')) : (
          <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px', position: 'relative' }} onMouseMove={e => setDonutMouse({ x: e.clientX, y: e.clientY })}>
            {renderDonut()}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#999999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>{t('reports.total')}</div>
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
          </>
          )}
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

      {/* 4. Smart Insights — заглушка до подключения AI-отчёта (задача FN-5.6).
          TODO: GET /ai/finance-insights?date_from&date_to → {summary: string, tips: string[]} */}
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
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>{t('reports.insightsTitle')}</div>
            <div style={{ fontSize: '13px', color: '#666666', lineHeight: 1.6 }}>
              {t('reports.insightsPlaceholder')}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
