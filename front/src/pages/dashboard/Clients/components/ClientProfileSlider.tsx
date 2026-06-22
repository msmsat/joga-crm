import { useState } from 'react';
import type { ClientData } from '../types';
import { STATUSES, STATUS_COLORS, VISITS_HISTORY } from '../constants';

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const IconPhone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 7.09 7.09l1.08-1.08a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconNote = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const IconFreeze = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M7 7l10 10M17 7L7 17"/>
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const IconLocation = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IconGift = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
  </svg>
);
const IconHistory = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
    <polyline points="12 7 12 12 16 14"/>
  </svg>
);
const IconMessage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const IconTrendUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

// ─── LOYALTY ILLUS ────────────────────────────────────────────────────────────
function LoyaltyIllus({ points }: { points: number }) {
  const tier = points >= 8000 ? 'Platinum' : points >= 3000 ? 'Gold' : points >= 1000 ? 'Silver' : 'Bronze';
  const tierColors: Record<string, [string, string]> = {
    Platinum: ['#e8e8ff', '#9090d0'],
    Gold:     ['#fff8d6', '#f0c040'],
    Silver:   ['#f0f0f0', '#aaaaaa'],
    Bronze:   ['#fde8d8', '#c87941'],
  };
  const [bg, stroke] = tierColors[tier];
  const r    = 36;
  const circ = 2 * Math.PI * r;
  const maxPoints = tier === 'Platinum' ? 15000 : tier === 'Gold' ? 8000 : tier === 'Silver' ? 3000 : 1000;
  const pct  = Math.min(points / maxPoints, 1);
  const dash = pct * circ;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: `${bg}60`, borderRadius: '12px', border: `1px solid ${stroke}40`, marginBottom: '12px' }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke={`${stroke}22`} strokeWidth="6"/>
        <circle cx="42" cy="42" r={r} fill="none" stroke={stroke} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 42 42)" style={{ transition: 'stroke-dasharray 1s ease' }}/>
        <text x="42" y="38" textAnchor="middle" fill={stroke} fontSize="10" fontWeight="800" fontFamily="Manrope">{tier}</text>
        <text x="42" y="52" textAnchor="middle" fill={stroke} fontSize="9" fontWeight="600" fontFamily="Manrope">{points.toLocaleString()}</text>
        <text x="42" y="62" textAnchor="middle" fill={`${stroke}99`} fontSize="7" fontWeight="500" fontFamily="Manrope">баллов</text>
      </svg>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Уровень {tier}</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', lineHeight: 1.5 }}>
          До следующего: {(maxPoints - points).toLocaleString()} баллов
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px' }}>
          <span style={{ background: `${stroke}22`, color: stroke, padding: '2px 8px', borderRadius: '20px', fontWeight: 700, fontSize: '10px' }}>
            ×{pct >= 1 ? '2.0' : pct >= 0.6 ? '1.5' : '1.0'} к баллам
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── ABONEMENT CARD ───────────────────────────────────────────────────────────
function AbonementCard({ ab, abMax, c }: { ab: number; abMax: number; c: string }) {
  const pct   = (ab / abMax) * 100;
  const isLow = pct <= 30;
  return (
    <div style={{ padding: '14px 16px', background: isLow ? 'rgba(216,140,154,0.06)' : 'rgba(91,171,114,0.05)', borderRadius: '12px', border: `1px solid ${isLow ? 'rgba(216,140,154,0.2)' : 'rgba(91,171,114,0.18)'}`, marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Абонемент</div>
        <div style={{ fontSize: '11px', color: isLow ? '#D88C9A' : '#5BAB72', fontWeight: 700 }}>{ab}/{abMax} занятий</div>
      </div>
      <div style={{ position: 'relative', height: '8px', background: 'rgba(26,26,26,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: isLow ? 'linear-gradient(90deg,#D88C9A,#c07080)' : `linear-gradient(90deg,${c},${c}bb)`, borderRadius: '10px', transition: 'width 0.6s ease' }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        {Array.from({ length: abMax }).map((_, i) => (
          <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i < ab ? c : 'rgba(26,26,26,0.1)', transition: 'background 0.3s' }}/>
        ))}
      </div>
      {isLow && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#D88C9A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Осталось мало занятий — предложить продление
        </div>
      )}
    </div>
  );
}

// ─── ACTIVITY CHART ───────────────────────────────────────────────────────────
function ActivityChart({ c, clientName }: { c: string; clientName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [period,   setPeriod]   = useState('3 мес');
  const [hovered,  setHovered]  = useState<number | null>(null);

  const miniBars = [40,65,30,80,55,90,45,70,85,60,75,95].map(h => Math.round(h * 0.9 + Math.random() * 10));
  const miniMax  = Math.max(...miniBars);

  function getDetailedData() {
    if (period === '1 мес') return [
      { l: 'Нед 1', v: 3 }, { l: 'Нед 2', v: 5 }, { l: 'Нед 3', v: 2 }, { l: 'Нед 4', v: 4 }
    ];
    if (period === '3 мес') return [
      { l:'Нед 1',v:2},{l:'Нед 2',v:4},{l:'Нед 3',v:3},{l:'Нед 4',v:5},
      { l:'Нед 5',v:1},{l:'Нед 6',v:4},{l:'Нед 7',v:6},{l:'Нед 8',v:3},
      { l:'Нед 9',v:5},{l:'Нед 10',v:2},{l:'Нед 11',v:4},{l:'Нед 12',v:3},
    ];
    return [
      { l:'Янв',v:12},{l:'Фев',v:15},{l:'Мар',v:10},
      { l:'Апр',v:18},{l:'Май',v:22},{l:'Июн',v:14}
    ];
  }

  const detailedData = getDetailedData();
  const detailedMax  = Math.max(...detailedData.map(d => d.v), 1);
  const totalVisits  = detailedData.reduce((s, d) => s + d.v, 0);

  return (
    <div style={{
      padding: expanded ? '24px' : '14px 16px',
      background: expanded ? '#FFFFFF' : 'rgba(26,26,26,0.02)',
      borderRadius: '16px',
      border: expanded ? `1px solid ${c}40` : '1px solid var(--border)',
      marginBottom: '14px',
      cursor: expanded ? 'default' : 'pointer',
      transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
      boxShadow: expanded ? `0 16px 40px -8px ${c}25` : 'none',
      position: 'relative',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}
    onClick={() => !expanded && setExpanded(true)}
    >
      <style>{`@keyframes chartFadeIn { from{opacity:0;transform:scale(0.98) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }`}</style>

      {expanded ? (
        <div style={{ animation: 'chartFadeIn 0.4s ease both' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>Детальная активность</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{clientName}</div>
            </div>
            <button onClick={e => { e.stopPropagation(); setExpanded(false); }} style={{ background: 'rgba(26,26,26,0.04)', border: 'none', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background='rgba(216,140,154,0.1)'; e.currentTarget.style.color='#D88C9A'; }} onMouseLeave={e => { e.currentTarget.style.background='rgba(26,26,26,0.04)'; e.currentTarget.style.color='var(--text3)'; }}>
              <IconClose/>
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: c, letterSpacing: '-1.5px', lineHeight: 1 }}>{totalVisits}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: '6px' }}>Визитов за период</div>
            </div>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(26,26,26,0.04)' }}>
              {['1 мес','3 мес','6 мес'].map(p => (
                <button key={p} onClick={e => { e.stopPropagation(); setPeriod(p); }} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope',sans-serif", background: period === p ? '#FFFFFF' : 'transparent', color: period === p ? 'var(--text)' : 'var(--text3)', boxShadow: period === p ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>{p}</button>
              ))}
            </div>
          </div>

          <div style={{ height: '160px', display: 'flex', alignItems: 'flex-end', gap: '6px', justifyContent: 'center', position: 'relative', marginTop: '10px', width: '100%', minWidth: 0 }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 0 }}>
              <div style={{ borderTop: '1px dashed rgba(26,26,26,0.06)', width: '100%' }}/>
              <div style={{ borderTop: '1px dashed rgba(26,26,26,0.06)', width: '100%' }}/>
              <div style={{ borderTop: '1px dashed rgba(26,26,26,0.06)', width: '100%' }}/>
            </div>
            {detailedData.map((d, i) => {
              const hPct     = (d.v / detailedMax) * 100;
              const isHov    = hovered === i;
              const showLbl  = period === '3 мес' ? i % 2 === 0 : true;
              const isFirst  = i === 0;
              const isLast   = i === detailedData.length - 1;
              return (
                <div key={i} style={{ flex: 1, maxWidth: '30px', minWidth: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end', position: 'relative', zIndex: isHov ? 10 : 1 }}
                  onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                    {isHov && (
                      <div style={{ position: 'absolute', bottom: `calc(${hPct}% + 8px)`, left: isFirst ? '0' : isLast ? '100%' : '50%', transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)', background: '#1A1A1A', color: '#FFF', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20 }}>
                        {d.v} визитов
                        <div style={{ position: 'absolute', bottom: '-4px', left: isFirst ? '15px' : isLast ? 'calc(100% - 15px)' : '50%', transform: 'translateX(-50%) rotate(45deg)', width: '10px', height: '10px', background: '#1A1A1A', borderRadius: '2px' }}/>
                      </div>
                    )}
                    <div style={{ width: '100%', height: `${hPct}%`, background: `linear-gradient(180deg,${c} 0%,${c}20 100%)`, borderRadius: '6px 6px 4px 4px', transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)', opacity: hovered !== null && !isHov ? 0.4 : 1, transform: isHov ? 'scaleY(1.05)' : 'scaleY(1)', transformOrigin: 'bottom', border: isHov ? `1px solid ${c}` : '1px solid transparent', borderBottom: 'none' }}/>
                  </div>
                  <div style={{ fontSize: '9px', color: isHov ? 'var(--text)' : 'var(--text3)', fontWeight: 800, transition: 'color 0.2s', textTransform: 'uppercase', whiteSpace: 'nowrap', opacity: showLbl ? 1 : 0 }}>{d.l}</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '24px', padding: '16px', background: `${c}08`, borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '14px', border: `1px solid ${c}25` }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `linear-gradient(135deg,${c},${c}88)`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 12px ${c}40` }}>
              <IconTrendUp/>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Устойчивый темп посещений</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                Клиент посещает студию в среднем <strong>2.5 раза в неделю</strong>. Предпочитает утренние слоты. Вероятность оттока крайне низкая.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Активность (3 мес.)</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.4 }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>Нажмите для деталей</span>
          </div>
          <svg width="100%" height="48" viewBox={`0 0 ${miniBars.length * 16} 48`} preserveAspectRatio="none">
            {miniBars.map((h, i) => {
              const barH = (h / miniMax) * 38;
              return (
                <g key={i}>
                  <rect x={i * 16 + 2} y={44 - barH} width="12" height={barH} rx="3" fill={`${c}30`} style={{ transition: 'all 0.3s' }}/>
                  <rect x={i * 16 + 2} y={44 - barH} width="12" height={Math.min(barH, 4)} rx="3" fill={c} style={{ transition: 'all 0.3s' }}/>
                </g>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}

// ─── CLIENT PANEL (inner panel body) ─────────────────────────────────────────
function ClientPanel({ client, onClose }: { client: ClientData; onClose: () => void }) {
  const [activeTab,    setActiveTab]    = useState<'info' | 'visits' | 'notes'>('info');
  const [status,       setStatus]       = useState(client.bl);
  const [showStatusDD, setShowStatusDD] = useState(false);
  const [showBooking,  setShowBooking]  = useState(false);
  const sc = STATUS_COLORS[status] || '#999';

  return (
    <div style={{ flex: 1, background: '#fff', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--border)', background: '#fdfcfb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `linear-gradient(135deg,${client.c},${client.c}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color: '#fff', boxShadow: `0 8px 20px -4px ${client.c}55` }}>{client.i}</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>{client.n}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                  <button onClick={() => setShowStatusDD(v => !v)} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', border: `1px solid ${sc}44`, background: `${sc}18`, color: sc, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Manrope' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: sc, display: 'inline-block' }}/>
                    {status}
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {showStatusDD && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden', minWidth: '140px' }}>
                      {STATUSES.map(s => (
                        <div key={s} onClick={() => { setStatus(s); setShowStatusDD(false); }} style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: STATUS_COLORS[s], cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = `${STATUS_COLORS[s]}12`)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: STATUS_COLORS[s] }}/>{s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>с {client.reg}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background='rgba(26,26,26,0.06)'; e.currentTarget.style.color='var(--text)'; }} onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text3)'; }}>
            <IconClose/>
          </button>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {[
            { icon: <IconPhone/>,   label: 'Позвонить', color: '#5BAB72'       },
            { icon: <IconMessage/>, label: 'Сообщение', color: '#4A80C4'       },
            { icon: <IconCalendar/>,label: 'Записать',  color: 'var(--peach)', primary: true },
            { icon: <IconGift/>,    label: 'Бонус',     color: '#f0c040'       },
          ].map(({ icon, label, color, primary }) => (
            <button key={label} onClick={() => label === 'Записать' && setShowBooking(true)} style={{ flex: 1, padding: '8px 4px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'linear-gradient(135deg,var(--peach),#F5866E)' : 'transparent', color: primary ? '#fff' : color, cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.2s', boxShadow: primary ? '0 4px 14px -2px rgba(249,160,139,0.4)' : 'none' }} onMouseEnter={e => { if (!primary) { e.currentTarget.style.background=`${color}12`; e.currentTarget.style.borderColor=color; } }} onMouseLeave={e => { if (!primary) { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='var(--border)'; } }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {(['info','visits','notes'] as const).map(t => {
            const labels = { info: 'Профиль', visits: 'Визиты', notes: 'Заметки' };
            return (
              <button key={t} onClick={() => setActiveTab(t)} style={{ flex: 1, padding: '9px 8px', fontSize: '12px', fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Manrope', color: activeTab === t ? 'var(--peach)' : 'var(--text3)', borderBottom: `2px solid ${activeTab === t ? 'var(--peach)' : 'transparent'}`, transition: 'all 0.2s' }}>{labels[t]}</button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <style>{`@keyframes fadeSlide{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} @keyframes panelSlideIn{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:translateX(0)}}`}</style>

        {activeTab === 'info' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '8px' }}>Контакты</div>
              {[
                { icon: <IconPhone/>,    val: client.phone, sub: 'Телефон'       },
                { icon: <IconMail/>,     val: client.email, sub: 'Email'         },
                { icon: <IconCalendar/>, val: client.bday,  sub: 'День рождения' },
                { icon: <IconLocation/>, val: client.city,  sub: 'Город'         },
              ].map(({ icon, val, sub }) => (
                <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '9px', marginBottom: '2px', transition: 'background 0.15s', cursor: 'default' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(26,26,26,0.03)')} onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', flexShrink: 0 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{val}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              {[
                { v: client.v,                    l: 'Визитов',   svg: <IconHistory/> },
                { v: client.spent,                l: 'Потрачено', svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
                { v: `${client.ab}/${client.abMax}`,l: 'Абонемент',svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
              ].map(({ v, l, svg }) => (
                <div key={l} style={{ padding: '12px 10px', background: 'rgba(26,26,26,0.02)', borderRadius: '10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ color: 'var(--text3)', marginBottom: '6px', display: 'flex', justifyContent: 'center' }}>{svg}</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>{v}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px' }}>{l}</div>
                </div>
              ))}
            </div>

            <LoyaltyIllus points={client.points}/>
            <AbonementCard ab={client.ab} abMax={client.abMax} c={client.c}/>
            <ActivityChart c={client.c} clientName={client.n}/>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '8px' }}>Теги</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {client.tags.map(tag => (
                  <span key={tag} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: `${client.c}18`, color: client.c, border: `1px solid ${client.c}30` }}>{tag}</span>
                ))}
                <button style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'Manrope', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor='var(--peach)'; e.currentTarget.style.color='var(--peach)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text3)'; }}>
                  <IconPlus/> Добавить
                </button>
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid rgba(216,140,154,0.2)', background: 'rgba(216,140,154,0.03)', display: 'flex', gap: '6px' }}>
              <button style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(123,108,212,0.25)', background: 'rgba(123,108,212,0.06)', color: '#7b6cd4', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'all 0.2s' }}>
                <IconFreeze/> Заморозить
              </button>
              <button style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(216,140,154,0.3)', background: 'rgba(216,140,154,0.06)', color: '#D88C9A', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'all 0.2s' }}>
                <IconTrash/> Удалить
              </button>
            </div>
          </div>
        )}

        {activeTab === 'visits' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '12px' }}>История визитов · последние 5</div>
            {VISITS_HISTORY.map((vis, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px', borderRadius: '10px', marginBottom: '4px', border: '1px solid var(--border)', background: '#fff', transition: 'all 0.15s', cursor: 'default' }} onMouseEnter={e => { e.currentTarget.style.borderColor=`${client.c}50`; e.currentTarget.style.boxShadow=`0 4px 12px -4px ${client.c}22`; }} onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.boxShadow='none'; }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: `${client.c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={client.c} strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{vis.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px' }}>{vis.trainer} · {vis.date}</div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: vis.paid.startsWith('₽') ? '#5BAB72' : 'var(--text3)' }}>{vis.paid}</div>
              </div>
            ))}
            <button style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '12px', fontWeight: 600, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor='var(--peach)'; e.currentTarget.style.color='var(--peach)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text3)'; }}>
              Показать все визиты →
            </button>
          </div>
        )}

        {activeTab === 'notes' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '12px' }}>Заметки администратора</div>
            <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'rgba(249,160,139,0.05)', border: '1px solid rgba(249,160,139,0.18)', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Заметка · {client.reg}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}><IconEdit/></button>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{client.note}</div>
            </div>
            <button style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '12px', fontWeight: 600, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor='var(--peach)'; e.currentTarget.style.color='var(--peach)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text3)'; }}>
              <IconNote/> Добавить заметку
            </button>
          </div>
        )}
      </div>

      {/* Quick booking */}
      {showBooking && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: '#fff', animation: 'panelSlideIn 0.25s ease both' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
            Быстрая запись
            <button onClick={() => setShowBooking(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><IconClose/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            {['Утренний пилатес','Йога-флоу','Стретчинг','Персональная'].map(cls => (
              <button key={cls} style={{ padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'rgba(26,26,26,0.02)', fontSize: '11px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', fontFamily: 'Manrope', textAlign: 'left', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor='var(--peach)'; e.currentTarget.style.background='rgba(249,160,139,0.05)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='rgba(26,26,26,0.02)'; }}>
                {cls}
              </button>
            ))}
          </div>
          <button style={{ width: '100%', padding: '11px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,var(--peach),#F5866E)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Manrope', boxShadow: '0 4px 14px -2px rgba(249,160,139,0.4)', transition: 'all 0.2s' }}>
            Записать на занятие →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── EXPORTED COMPONENT ───────────────────────────────────────────────────────
export interface ClientProfileSliderProps {
  client: ClientData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ClientProfileSlider({ client, isOpen, onClose }: ClientProfileSliderProps) {
  return (
    <>
      <style>{`
        .right-panel-wrapper {
          width: 0; opacity: 0; transform: translateX(20px);
          margin-left: 0px;
          transition:
            width 0.35s cubic-bezier(0.2,0.8,0.2,1),
            opacity 0.25s ease-out,
            transform 0.35s cubic-bezier(0.2,0.8,0.2,1),
            margin-left 0.35s ease;
          overflow: hidden; flex-shrink: 0;
          background: #fff; border-left: none;
          box-shadow: -10px 0 30px rgba(0,0,0,0.03);
          
          /* 🔥 БЕРЕМ ВЫСОТУ ОТ РОДИТЕЛЯ И ИЗОЛИРУЕМ СКРОЛЛ */
          height: 100%; 
          border-radius: 16px; /* Закругляем для красоты, если панель не прилепает к самому краю экрана */
        }
        .right-panel-wrapper.is-open {
          width: 420px; opacity: 1; transform: translateX(0); margin-left: 20px;
        }
        .right-panel-inner {
          width: 420px;
          height: 100%;
          display: flex; flex-direction: column;
          /* 🔥 Запрещаем передачу скролла выше */
          overscroll-behavior: contain; 
        }
      `}</style>
      <div className={`right-panel-wrapper ${isOpen ? 'is-open' : ''}`}>
        <div className="right-panel-inner">
          {client && <ClientPanel key={client.id} client={client} onClose={onClose}/>}
        </div>
      </div>
    </>
  );
}
