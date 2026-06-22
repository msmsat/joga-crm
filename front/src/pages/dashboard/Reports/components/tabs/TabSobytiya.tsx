import { useState } from 'react';
import type { Period, EventRecord } from '../../types';
import { EVENTS_DATA } from '../../constants';

function EventIllus({ color }: { color: string }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <rect x="2" y="6" width="40" height="36" rx="8" fill={`${color}15`} stroke={`${color}40`} strokeWidth="1.5"/>
      <line x1="14" y1="2" x2="14" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="30" y1="2" x2="30" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="6"  y1="18" x2="38" y2="18" stroke={`${color}50`} strokeWidth="1.5"/>
      <rect x="10" y="24" width="8" height="8" rx="2" fill={`${color}60`}/>
      <rect x="22" y="24" width="8" height="8" rx="2" fill={`${color}30`}/>
    </svg>
  );
}

const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="#f0c040" stroke="#f0c040" strokeWidth="1.5">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const SUMMARY_ITEMS = [
  { label: 'Мероприятий', val: '5',   sub: 'за период',   color: 'var(--accent)' },
  { label: 'Участников',  val: '65',  sub: 'суммарно',    color: '#5BAB72'       },
  { label: 'Выручка',     val: '₽51K',sub: 'от событий',  color: '#4A80C4'       },
  { label: 'Предстоит',   val: '2',   sub: 'в ближайшем', color: '#f0c040'       },
];

function EventDetail({ ev }: { ev: EventRecord }) {
  return (
    <div style={{ padding: '14px 16px', marginBottom: '10px', background: `${ev.color}05`, border: `1px solid ${ev.color}20`, borderRadius: '10px', animation: 'fadeSlide 0.2s ease' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
        {[
          { l: 'Дата',       v: ev.date         },
          { l: 'Тип',        v: ev.type         },
          { l: 'Статус',     v: ev.status       },
          { l: 'Участников', v: `${ev.attendees}`},
          { l: 'Выручка',    v: ev.revenue      },
          { l: 'Тренер',     v: 'Анна Смирнова' },
        ].map(({ l, v }) => (
          <div key={l} style={{ background: 'var(--bg)', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{l}</div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>
      {ev.status === 'Завершено' && ev.attendees > 0 && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Отзывы</div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {[1,2,3,4,5].map(n => <StarIcon key={n}/>)}
            <span style={{ fontSize: '13px', fontWeight: 800, marginLeft: '6px' }}>4.9</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic' }}>
            "Отличное мероприятие, очень профессионально! Обязательно приду снова."
          </div>
        </div>
      )}
    </div>
  );
}

export interface TabSobytiyaProps {
  period: Period;
}

export function TabSobytiya({ period: _period }: TabSobytiyaProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <>
      {/* Summary chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {SUMMARY_ITEMS.map(({ label, val, sub, color }) => (
          <div key={label} className="stat-card">
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color, letterSpacing: '-0.5px' }}>{val}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Events list */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Все события</div>
        {EVENTS_DATA.map((ev, i) => (
          <div key={i}>
            <div
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', borderRadius: '10px', cursor: 'pointer', background: expanded === i ? `${ev.color}08` : 'transparent', border: `1px solid ${expanded === i ? ev.color + '30' : 'transparent'}`, transition: 'all 0.18s', marginBottom: '6px' }}
            >
              <EventIllus color={ev.color}/>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{ev.title}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: ev.status === 'Завершено' ? 'rgba(163,201,168,0.2)' : 'rgba(252,174,145,0.2)', color: ev.status === 'Завершено' ? '#4a8a52' : '#d06040' }}>{ev.status}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{ev.date} · {ev.type}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: ev.color }}>{ev.revenue}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{ev.attendees} участников</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" style={{ transform: expanded === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            {expanded === i && <EventDetail ev={ev}/>}
          </div>
        ))}
      </div>
    </>
  );
}
