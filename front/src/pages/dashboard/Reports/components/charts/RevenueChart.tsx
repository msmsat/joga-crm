import { useState } from 'react';
import type { Period, CandleTooltipData } from '../../types';
import { MONTHS, MONTH_VALS } from '../../constants';

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
function CandleTooltip({ data, visible, x, y }: { data: CandleTooltipData | null; visible: boolean; x: number; y: number }) {
  if (!data || !visible) return null;
  return (
    <div style={{
      position: 'fixed', left: x + 12, top: y - 10, zIndex: 9999, pointerEvents: 'none',
      background: '#1A1A1A', borderRadius: '12px', padding: '12px 14px', minWidth: '160px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)', color: '#fff',
      animation: 'tooltipIn 0.15s ease',
    }}>
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{data.month}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>₽{data.val}тыс.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {[
          { l: 'Занятий',  v: String(data.sessions) },
          { l: 'Клиентов', v: String(data.clients) },
          { l: 'vs прошлый', v: `${data.pct >= 0 ? '+' : ''}${data.pct}%`, color: data.pct >= 0 ? '#A3C9A8' : '#D88C9A' },
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

// ─── ANALYTICS ILLUSTRATION ───────────────────────────────────────────────────
function AnalyticsIllus() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', opacity: 0.8, pointerEvents: 'none' }}>
      <circle cx="90" cy="40" r="34" fill="rgba(252,174,145,0.08)"/>
      <circle cx="90" cy="40" r="28" fill="none" stroke="rgba(252,174,145,0.2)" strokeWidth="1" strokeDasharray="4 3"/>
      <rect x="6"  y="46" width="10" height="24" rx="3" fill="rgba(252,174,145,0.25)"/>
      <rect x="20" y="34" width="10" height="36" rx="3" fill="rgba(252,174,145,0.45)"/>
      <rect x="34" y="22" width="10" height="48" rx="3" fill="rgba(252,174,145,0.7)"/>
      <rect x="48" y="30" width="10" height="40" rx="3" fill="rgba(252,174,145,0.55)"/>
      <polyline points="11,46 25,34 39,22 53,30" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {[[11,46],[25,34],[39,22],[53,30]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" stroke="white" strokeWidth="1.5"/>
      ))}
      <circle cx="90" cy="40" r="16" fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.3)" strokeWidth="1.5"/>
      <text x="90" y="45" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Manrope" fill="var(--accent)">+18%</text>
    </svg>
  );
}

// ─── EXPORTED COMPONENT ───────────────────────────────────────────────────────
export interface RevenueChartProps {
  period: Period;
}

export function RevenueChart({ period }: RevenueChartProps) {
  const [hoveredIdx,  setHoveredIdx]  = useState<number | null>(null);
  const [tooltipData, setTooltipData] = useState<CandleTooltipData | null>(null);
  const [tooltipPos,  setTooltipPos]  = useState({ x: 0, y: 0 });

  const vals       = MONTH_VALS[period];
  const maxVal     = Math.max(...vals);
  const sessionsData = [148, 167, 184, 156, 201, 195, 213];
  const clientsData  = [89,  102, 115, 97,  128, 121, 134];
  const pctChanges   = [0,   +16, +14, -18, +38, -4,  +9];

  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
      <AnalyticsIllus/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>Выручка по периодам</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Наведи на свечку — увидишь детали</div>
        </div>
      </div>

      {/* Chart bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '180px', padding: '10px 0 0', position: 'relative' }}>
        {[25, 50, 75, 100].map(pct => (
          <div key={pct} style={{ position: 'absolute', left: 0, right: 0, bottom: `${pct}%`, height: '1px', background: 'rgba(26,26,26,0.05)', zIndex: 0, pointerEvents: 'none' }}/>
        ))}
        {vals.map((v, i) => {
          const h      = (v / maxVal) * 100;
          const isActive = hoveredIdx === i;
          const isHigh   = v === maxVal;
          const bodyH    = Math.max(h - 4, 8);
          const wickTop  = h + 4;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative', zIndex: 1, cursor: 'pointer' }}
              onMouseEnter={e => {
                setHoveredIdx(i);
                setTooltipData({ month: MONTHS[i], val: v, pct: pctChanges[i], sessions: sessionsData[i], clients: clientsData[i], period });
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => { setHoveredIdx(null); setTooltipData(null); }}
            >
              <div style={{ width: '2px', background: isActive ? 'var(--accent)' : 'rgba(252,174,145,0.4)', height: `${wickTop}%`, position: 'absolute', bottom: 0, borderRadius: '2px', transition: 'all 0.2s' }}/>
              <div style={{ width: '100%', maxWidth: '32px', height: `${bodyH}%`, position: 'absolute', bottom: 0, background: isActive ? 'linear-gradient(180deg,var(--accent) 0%,#F5866E 100%)' : isHigh ? 'linear-gradient(180deg,rgba(252,174,145,0.9) 0%,rgba(249,160,139,0.6) 100%)' : 'rgba(252,174,145,0.3)', borderRadius: '4px 4px 2px 2px', transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)', transform: isActive ? 'scaleX(1.05)' : 'none', boxShadow: isActive ? '0 4px 14px rgba(252,174,145,0.5)' : 'none' }}/>
              {isActive && (
                <div style={{ position: 'absolute', bottom: `calc(${bodyH}% + 8px)`, fontSize: '10px', fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap', animation: 'fadeSlide 0.15s ease' }}>
                  ₽{v}K
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        {MONTHS.map((m, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: hoveredIdx === i ? 'var(--accent)' : 'var(--text3)', fontWeight: hoveredIdx === i ? 700 : 500, transition: 'all 0.15s' }}>{m}</div>
        ))}
      </div>

      <CandleTooltip data={tooltipData} visible={hoveredIdx !== null} x={tooltipPos.x} y={tooltipPos.y}/>
    </div>
  );
}
