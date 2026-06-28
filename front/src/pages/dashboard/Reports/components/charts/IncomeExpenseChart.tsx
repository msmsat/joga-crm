import { useState } from 'react';

const fmt = (n: number) => '₽' + n.toLocaleString('ru-RU');

// ─── DATA ─────────────────────────────────────────────────────────────────────
type PairPoint = { label: string; income: number; expense: number; incPct: number; expPct: number };

const INCOME_MULTS  = [0.6, 0.9, 1.2, 0.8, 1.4, 1.1, 1.6, 1.7];
const EXPENSE_MULTS = [0.5, 0.7, 1.0, 0.6, 1.2, 0.9, 1.4, 1.3];
const INC_PCT  = [0, +14, +12, -8,  +22, -4,  +18, +9 ];
const EXP_PCT  = [0, +8,  +6,  -5,  +14, -3,  +11, +7 ];

const BASE_INCOME  = 284000 / 5;
const BASE_EXPENSE = 210000 / 5;

const MONTH_LABELS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг'];
const WEEK_LABELS  = ['Нед 1','Нед 2','Нед 3','Нед 4','Нед 5','Нед 6','Нед 7','Нед 8'];
const DAY_LABELS   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс','Пн'];

function getPairData(period: 'Месяц' | 'Неделя' | 'День'): PairPoint[] {
  const labels  = period === 'Неделя' ? WEEK_LABELS : period === 'День' ? DAY_LABELS : MONTH_LABELS;
  const incBase = period === 'День' ? BASE_INCOME / 30 : period === 'Неделя' ? BASE_INCOME / 4 : BASE_INCOME;
  const expBase = period === 'День' ? BASE_EXPENSE / 30 : period === 'Неделя' ? BASE_EXPENSE / 4 : BASE_EXPENSE;
  return labels.map((label, i) => ({
    label,
    income:  Math.round(incBase  * INCOME_MULTS[i]),
    expense: Math.round(expBase  * EXPENSE_MULTS[i]),
    incPct:  INC_PCT[i],
    expPct:  EXP_PCT[i],
  }));
}

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
type TooltipData = { label: string; val: number; type: 'income' | 'expense'; pct: number };

function CandleTooltip({ data, visible, x, y }: { data: TooltipData | null; visible: boolean; x: number; y: number }) {
  if (!data || !visible) return null;
  const isIncome = data.type === 'income';
  const typeColor = isIncome ? '#5BAB72' : '#D88C9A';
  return (
    <div style={{
      position: 'fixed', left: x + 12, top: y - 10, zIndex: 9999, pointerEvents: 'none',
      background: '#1A1A1A', borderRadius: '12px', padding: '12px 14px', minWidth: '160px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)', color: '#fff',
      animation: 'tooltipIn 0.15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: typeColor, flexShrink: 0 }} />
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {data.label} · {isIncome ? 'Доходы' : 'Расходы'}
        </span>
      </div>
      <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>{fmt(data.val)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
        <span>vs прошлый</span>
        <span style={{ fontWeight: 700, color: data.pct >= 0 ? '#A3C9A8' : '#D88C9A' }}>
          {data.pct >= 0 ? '+' : ''}{data.pct}%
        </span>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function IncomeExpenseChart() {
  const [period, setPeriod] = useState<'Месяц' | 'Неделя' | 'День'>('Месяц');
  const [hoveredKey, setHoveredKey]     = useState<{ idx: number; type: 'income' | 'expense' } | null>(null);
  const [tooltipData, setTooltipData]   = useState<TooltipData | null>(null);
  const [tooltipPos,  setTooltipPos]    = useState({ x: 0, y: 0 });

  const data   = getPairData(period);
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);

  const maxIncome  = Math.max(...data.map(d => d.income));
  const maxExpense = Math.max(...data.map(d => d.expense));

  const renderCandle = (idx: number, type: 'income' | 'expense', val: number, pct: number) => {
    const isIncome = type === 'income';
    const active   = hoveredKey?.idx === idx && hoveredKey?.type === type;
    const isHigh   = isIncome ? val === maxIncome : val === maxExpense;

    const h     = (val / maxVal) * 100;
    const bodyH = Math.max(h - 4, 8);
    const wickH = h + 4;

    const wColor  = active ? (isIncome ? '#5BAB72' : '#D88C9A') : (isIncome ? 'rgba(163,201,168,0.4)' : 'rgba(216,140,154,0.4)');
    const bColor  = active
      ? (isIncome ? 'linear-gradient(180deg,#5BAB72 0%,#3D9060 100%)' : 'linear-gradient(180deg,#D88C9A 0%,#C4697A 100%)')
      : isHigh
        ? (isIncome ? 'linear-gradient(180deg,rgba(163,201,168,0.9) 0%,rgba(91,171,114,0.6) 100%)' : 'linear-gradient(180deg,rgba(216,140,154,0.9) 0%,rgba(196,105,122,0.6) 100%)')
        : (isIncome ? 'rgba(163,201,168,0.3)' : 'rgba(216,140,154,0.3)');
    const shadow = isIncome ? '0 4px 14px rgba(91,171,114,0.4)' : '0 4px 14px rgba(216,140,154,0.4)';

    return (
      <div
        key={type}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative', cursor: 'pointer' }}
        onMouseEnter={e => {
          setHoveredKey({ idx, type });
          setTooltipData({ label: data[idx].label, val, type, pct });
          setTooltipPos({ x: e.clientX, y: e.clientY });
        }}
        onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => { setHoveredKey(null); setTooltipData(null); }}
      >
        {/* Фітиль */}
        <div style={{ width: '2px', background: wColor, height: `${wickH}%`, position: 'absolute', bottom: 0, borderRadius: '2px', transition: 'all 0.2s' }} />
        {/* Тіло */}
        <div style={{ width: '100%', maxWidth: '28px', height: `${bodyH}%`, position: 'absolute', bottom: 0, background: bColor, borderRadius: '4px 4px 2px 2px', transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)', transform: active ? 'scaleX(1.05)' : 'none', boxShadow: active ? shadow : 'none' }} />
        {/* Число над свічкою */}
        {active && (
          <div style={{ position: 'absolute', bottom: `calc(${bodyH}% + 6px)`, left: '50%', transform: 'translateX(-50%)', fontSize: '9px', fontWeight: 800, color: '#1A1A1A', whiteSpace: 'nowrap', animation: 'fadeSlide 0.15s ease', pointerEvents: 'none' }}>
            {fmt(val)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card" style={{ marginBottom: '20px' }}>

      {/* Заголовок */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700 }}>Выручка по периодам</div>
        <div style={{ display: 'flex', gap: '3px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.06)', borderRadius: '9px', padding: '3px' }}>
          {(['Месяц', 'Неделя', 'День'] as const).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setHoveredKey(null); setTooltipData(null); }}
              style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', background: period === p ? '#FFFFFF' : 'transparent', color: period === p ? '#1A1A1A' : 'var(--text3)', boxShadow: period === p ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* Графік */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '180px', padding: '20px 0 0', position: 'relative' }}>
        {[25, 50, 75, 100].map(pct => (
          <div key={pct} style={{ position: 'absolute', left: 0, right: 0, bottom: `${pct}%`, height: '1px', background: 'rgba(26,26,26,0.05)', zIndex: 0, pointerEvents: 'none' }} />
        ))}
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', gap: '4px', height: '100%', position: 'relative', zIndex: 1 }}>
            {renderCandle(i, 'income',  d.income,  d.incPct)}
            {renderCandle(i, 'expense', d.expense, d.expPct)}
          </div>
        ))}
      </div>

      {/* Підписи */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
        {data.map((d, i) => {
          const isAct   = hoveredKey?.idx === i;
          const actColor = hoveredKey?.type === 'income' ? '#5BAB72' : '#D88C9A';
          return (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: isAct ? actColor : 'var(--text3)', fontWeight: isAct ? 700 : 500, transition: 'all 0.15s' }}>{d.label}</div>
          );
        })}
      </div>

      {/* Футер — легенда + експорт */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#5BAB72' }} /> Доходы
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#D88C9A' }} /> Расходы
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 14px', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: '8px', color: 'var(--text2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Экспорт PDF
          </button>
        </div>
      </div>

      <CandleTooltip data={tooltipData} visible={hoveredKey !== null} x={tooltipPos.x} y={tooltipPos.y} />
    </div>
  );
}
