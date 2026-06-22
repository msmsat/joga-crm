import { useState } from 'react';
import type { Period } from '../../types';
import { ProgressBar } from '../ProgressBar';

// ─── RETENTION ARC ────────────────────────────────────────────────────────────
function RetentionArc({ value }: { value: number }) {
  return (
    <svg width="110" height="60" viewBox="0 0 110 60">
      <path d="M 8 58 A 47 47 0 0 1 102 58" fill="none" stroke="rgba(26,26,26,0.06)" strokeWidth="10" strokeLinecap="round"/>
      <path d="M 8 58 A 47 47 0 0 1 102 58" fill="none" stroke="url(#retGrad)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(value / 100) * 147} 147`}/>
      <defs>
        <linearGradient id="retGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FCAE91"/>
          <stop offset="100%" stopColor="#F5866E"/>
        </linearGradient>
      </defs>
      <text x="55" y="52" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Manrope" fill="var(--text)">{value}%</text>
    </svg>
  );
}

// ─── EXPORTED COMPONENT ───────────────────────────────────────────────────────
export interface AttendanceChartProps {
  period: Period;
}

const ATTENDANCE_BARS = [70, 85, 60, 95, 80, 45, 100, 75, 90, 55, 88, 72, 65, 92];

const RETENTION_ITEMS = [
  { label: 'Вернулись во 2-й раз', val: 94, color: 'var(--accent)' },
  { label: 'Регулярные (6+ мес)',  val: 71, color: '#5BAB72'        },
  { label: 'Отток за месяц',       val: 13, color: '#D88C9A'        },
];

export function AttendanceChart({ period: _period }: AttendanceChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Retention card */}
      <div className="card" style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Удержание клиентов</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <RetentionArc value={87}/>
          <div style={{ flex: 1 }}>
            {RETENTION_ITEMS.map(({ label, val, color }) => (
              <div key={label} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color }}>{val}%</span>
                </div>
                <ProgressBar value={val} color={color}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly load card */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Загрузка за 2 недели</div>
        <div style={{ display: 'flex', gap: '4px', height: '60px', alignItems: 'flex-end' }}>
          {ATTENDANCE_BARS.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1, borderRadius: '3px 3px 0 0',
                height: `${v}%`,
                background: hovered === i
                  ? 'var(--accent)'
                  : v === 100
                    ? 'rgba(252,174,145,0.8)'
                    : 'rgba(252,174,145,0.35)',
                transition: 'all 0.18s', cursor: 'pointer',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              title={`${v}% загрузки`}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          {['Пн','Вт','Ср','Чт','Пт','Сб','Вс','Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '8px', color: hovered === i ? 'var(--accent)' : 'var(--text3)', fontWeight: 600, transition: 'color 0.15s' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', color: 'var(--text3)' }}>
          <span>Ср. загрузка: <strong style={{ color: 'var(--text)' }}>76%</strong></span>
          <span>Пик: <strong style={{ color: 'var(--accent)' }}>100% (вт/пт)</strong></span>
        </div>
      </div>
    </div>
  );
}
