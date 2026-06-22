import { useState } from 'react';
import type { Period } from '../../types';
import { TRAINER_DATA, PERIOD_LABELS } from '../../constants';
import { ProgressBar } from '../ProgressBar';

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

const LOAD_BARS = [70, 85, 60, 95, 80, 45, 100, 75, 90, 55, 88, 72, 65, 92];

export interface TabTreneryProps {
  period: Period;
}

export function TabTrenery({ period }: TabTreneryProps) {
  const [selected, setSelected] = useState(0);
  const t = TRAINER_DATA[selected];

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
                <div style={{ fontSize: '16px', fontWeight: 800, color: trainer.color }}>{trainer.revenue}</div>
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
              { label: 'Выручка',   val: t.revenue    },
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
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Загрузка по дням</div>
        <div style={{ display: 'flex', gap: '6px', height: '60px', alignItems: 'flex-end' }}>
          {LOAD_BARS.map((v, i) => (
            <div key={i} style={{ flex: 1, borderRadius: '3px 3px 0 0', height: `${v}%`, background: v === 100 ? t.color : `${t.color}55`, transition: 'all 0.2s', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = t.color; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = v === 100 ? t.color : `${t.color}55`; }}
              title={`${v}% загрузки`}
            />
          ))}
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
              <span style={{ fontSize: '13px', fontWeight: 800, width: '60px', textAlign: 'right' }}>{tr.revenue}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
