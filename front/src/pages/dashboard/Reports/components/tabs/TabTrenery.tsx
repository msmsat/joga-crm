import { useState } from 'react';
import type { Period } from '../../types';
import { TRAINER_DATA, PERIOD_LABELS } from '../../constants';
import { ProgressBar } from '../ProgressBar';

const fmtK = (n: number): string => `₽${Math.round(n / 1000)}K`;

function TrainerIllus({ color }: { color: string }) {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="24" fill={`${color}22`}/>
      <circle cx="24" cy="18" r="8" fill={`${color}55`} stroke={color} strokeWidth="1.5"/>
      <path d="M10 40 Q10 30 24 30 Q38 30 38 40" fill={`${color}40`} stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="36" cy="10" r="7" fill={color} opacity="0.9"/>
      <text x="36" y="14" textAnchor="middle" fontSize="9" fontWeight="800" fontFamily="Manrope" fill="white">★</text>
    </svg>
  );
}

const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="#f0c040" stroke="#f0c040" strokeWidth="1.5">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const LOAD_BARS = [
  72, 85, 60, 92, 88, 45, 30,
  78, 90, 65, 95, 82, 50, 35,
  80, 88, 70, 98, 86, 55, 40,
  75, 92, 68, 100, 84, 48, 32,
  82, 88, 72, 96, 90, 52, 38,
  78, 85, 65, 94, 87, 45, 35,
  80, 90, 70, 96, 88, 50, 38,
];

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const tension = 0.2;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + tension * (p2.x - p0.x);
    const cp1y = p1.y + tension * (p2.y - p0.y);
    const cp2x = p2.x - tension * (p3.x - p1.x);
    const cp2y = p2.y - tension * (p3.y - p1.y);
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export interface TabTreneryProps {
  period: Period;
}

export function TabTrenery({ period }: TabTreneryProps) {
  const [selected, setSelected] = useState(0);
  const [hoveredLoad, setHoveredLoad] = useState<number | null>(null);
  const t = TRAINER_DATA[selected];

  const CW = 280, CH = 120, cPad = 8;
  const chartPts = LOAD_BARS.map((v, i) => ({
    x: i * CW / (LOAD_BARS.length - 1),
    y: cPad + (1 - v / 100) * (CH - 2 * cPad),
  }));
  const linePath = smoothPath(chartPts);
  const areaPath = linePath + ` L ${CW},${CH} L 0,${CH} Z`;
  const activeIdx = hoveredLoad ?? LOAD_BARS.length - 1;

  const kpiItems = [
    { label: 'Выполнение плана',   val: 94,          color: t.color  },
    { label: 'Удержание клиентов', val: t.retention,  color: '#5BAB72'},
    { label: 'Заполняемость групп', val: 82,          color: '#4A80C4'},
    { label: 'Отмены занятий',      val: 6,           color: '#D88C9A'},
  ];

  return (
    <>
      {/* Trainer selector grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {TRAINER_DATA.map((trainer, i) => (
          <div key={i} onClick={() => setSelected(i)} style={{ background: 'var(--card)', border: `1px solid ${selected === i ? trainer.color : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '18px', cursor: 'pointer', boxShadow: selected === i ? `0 0 0 3px ${trainer.color}25, var(--dash-shadow)` : 'var(--dash-shadow)', transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)', transform: selected === i ? 'translateY(-2px)' : 'none', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: selected === i ? trainer.color : 'transparent', transition: 'background 0.2s' }}/>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <TrainerIllus color={trainer.color}/>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{trainer.name.split(' ')[0]}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{trainer.role}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <StarIcon/><span style={{ fontSize: '12px', fontWeight: 700 }}>{trainer.rating}</span>
              </div>
              <div style={{ width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: trainer.color }}>{fmtK(trainer.revenue)}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>{trainer.sessions} занятий</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trainer detail */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <TrainerIllus color={t.color}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 800 }}>{t.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
              {t.role} · {PERIOD_LABELS[period].toLowerCase()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            {[
              { label: 'Занятий',   val: t.sessions   },
              { label: 'Выручка',   val: fmtK(t.revenue) },
              { label: 'Удержание', val: `${t.retention}%` },
              { label: 'Рейтинг',   val: t.rating     },
            ].map(({ label, val }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: t.color }}>{val}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Load chart */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '16px 18px 14px',
          marginTop: '4px',
          boxShadow: 'var(--dash-shadow)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Загрузка по дням
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', opacity: hoveredLoad !== null ? 1 : 0.55, transition: 'opacity 0.15s' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)' }}>
                Нед {Math.floor(activeIdx / 7) + 1} · {WEEK_DAYS[activeIdx % 7]}
              </span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: t.color, lineHeight: 1 }}>
                {LOAD_BARS[activeIdx]}%
              </span>
            </div>
          </div>
          <div style={{ width: '100%', height: '120px', position: 'relative' }}>
            <>
                <div style={{
                  position: 'absolute',
                  left: `${activeIdx * 100 / (LOAD_BARS.length - 1)}%`,
                  top: `${chartPts[activeIdx].y / CH * 100}%`,
                  width: '14px', height: '14px',
                  borderRadius: '50%',
                  border: '2px solid rgba(26,26,26,0.2)',
                  background: 'rgba(252,174,145,0.1)',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}/>
                <div style={{
                  position: 'absolute',
                  left: `${activeIdx * 100 / (LOAD_BARS.length - 1)}%`,
                  top: `${chartPts[activeIdx].y / CH * 100}%`,
                  width: '7px', height: '7px',
                  borderRadius: '50%',
                  background: t.color,
                  border: '1.5px solid rgba(255,255,255,0.9)',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 3,
                  boxShadow: `0 0 8px ${t.color}80`,
                }}/>
            </>
            <svg width="100%" height="100%" viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="trainerAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.color} stopOpacity="0.40"/>
                  <stop offset="100%" stopColor={t.color} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {[25, 50, 75].map(pct => {
                const gy = cPad + (1 - pct / 100) * (CH - 2 * cPad);
                return (
                  <line key={pct} x1={0} y1={gy} x2={CW} y2={gy}
                    stroke="rgba(26,26,26,0.06)" strokeWidth="1"
                    style={{ vectorEffect: 'non-scaling-stroke' } as React.CSSProperties}
                  />
                );
              })}
              <path d={areaPath} fill="url(#trainerAreaGrad)"/>
              <path d={linePath} fill="none" stroke={t.color} strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ vectorEffect: 'non-scaling-stroke' } as React.CSSProperties}
              />
              <line
                  x1={chartPts[activeIdx].x} y1={chartPts[activeIdx].y}
                  x2={chartPts[activeIdx].x} y2={CH}
                  stroke="rgba(26,26,26,0.12)" strokeWidth="1"
                  style={{ vectorEffect: 'non-scaling-stroke' } as React.CSSProperties}
                />
              {LOAD_BARS.map((_, i) => {
                const step = CW / (LOAD_BARS.length - 1);
                const last = LOAD_BARS.length - 1;
                return (
                  <rect key={i}
                    x={i === 0 ? 0 : i * step - step / 2}
                    y={0}
                    width={i === 0 || i === last ? step / 2 : step}
                    height={CH}
                    fill="transparent"
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={() => setHoveredLoad(i)}
                    onMouseLeave={() => setHoveredLoad(null)}
                  />
                );
              })}
            </svg>
          </div>
        </div>

        {/* KPI grid */}
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {kpiItems.map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color }}>{val}%</span>
              </div>
              <ProgressBar value={val} color={color} height={6}/>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue comparison */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Сравнение по выручке</div>
        {TRAINER_DATA.map((tr, i) => (
          <div key={i} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tr.color, flexShrink: 0 }}/>
              <span style={{ fontSize: '12px', fontWeight: 600, width: '130px' }}>{tr.name}</span>
              <div style={{ flex: 1 }}>
                <ProgressBar value={Math.round(tr.sessions / TRAINER_DATA[0].sessions * 100)} color={tr.color} height={7}/>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, width: '60px', textAlign: 'right' }}>{fmtK(tr.revenue)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
