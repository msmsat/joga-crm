import { useState } from 'react';
import type { Period } from '../../types';
import { SERVICE_DATA } from '../../constants';
import { DetailedTable } from '../DetailedTable';

export interface TabUslugiProps {
  period: Period;
}

export function TabUslugi({ period: _period }: TabUslugiProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <>
      {/* Service cards grid */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        {SERVICE_DATA.map((svc, i) => (
          <div key={i} className="card" style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)', transform: hovered === i ? 'translateY(-3px)' : 'none', boxShadow: hovered === i ? `0 12px 32px -8px ${svc.color}40, var(--dash-shadow)` : 'var(--dash-shadow)', border: `1px solid ${hovered === i ? svc.color + '60' : 'var(--border)'}` }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: svc.color }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '3px' }}>{svc.name}</div>
                <div style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: svc.trend.startsWith('+') ? 'rgba(91,171,114,0.15)' : 'rgba(216,140,154,0.15)', color: svc.trend.startsWith('+') ? '#4a8a52' : '#b25d6e', display: 'inline-block' }}>{svc.trend}</div>
              </div>
              {/* Mini donut */}
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="20" fill="none" stroke={`${svc.color}20`} strokeWidth="7"/>
                <circle cx="26" cy="26" r="20" fill="none" stroke={svc.color} strokeWidth="7" strokeDasharray={`${svc.share * 1.257} ${125.66 - svc.share * 1.257}`} strokeLinecap="round" transform="rotate(-90 26 26)"/>
                <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Manrope" fill="var(--text)">{svc.share}%</text>
              </svg>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: svc.color }}>{svc.revenue}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>выручка</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800 }}>{svc.sessions}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>занятий</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <DetailedTable rows={SERVICE_DATA}/>
    </>
  );
}
