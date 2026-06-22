import type { ServiceRecord } from '../types';

export interface DetailedTableProps {
  rows: ServiceRecord[];
  title?: string;
}

export function DetailedTable({ rows, title = 'Детализация по услугам' }: DetailedTableProps) {
  const avgCheck = (svc: ServiceRecord) => {
    const rev = parseInt(svc.revenue.replace(/[₽K]/g, '')) * 1000;
    return `₽${Math.round(rev / svc.sessions)}`;
  };

  return (
    <div className="card">
      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>{title}</div>

      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
        gap: '12px', padding: '0 0 10px', borderBottom: '1px solid var(--border)',
        fontSize: '10px', fontWeight: 700, color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: '0.4px',
      }}>
        <span>Услуга</span>
        <span style={{ textAlign: 'right' }}>Занятий</span>
        <span style={{ textAlign: 'right' }}>Выручка</span>
        <span style={{ textAlign: 'right' }}>Средний чек</span>
        <span style={{ textAlign: 'right' }}>Динамика</span>
      </div>

      {/* Rows */}
      {rows.map((svc, i) => (
        <div
          key={i}
          style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
            gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border)',
            alignItems: 'center', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background     = `${svc.color}08`;
            el.style.borderRadius   = '8px';
            el.style.padding        = '12px 8px';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background   = 'transparent';
            el.style.padding      = '12px 0';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: svc.color, flexShrink: 0 }}/>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{svc.name}</span>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>{svc.sessions}</span>
          <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>{svc.revenue}</span>
          <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', color: 'var(--text2)' }}>{avgCheck(svc)}</span>
          <div style={{ textAlign: 'right', fontSize: '11px', fontWeight: 800, color: svc.trend.startsWith('+') ? '#5BAB72' : '#D88C9A' }}>
            {svc.trend}
          </div>
        </div>
      ))}
    </div>
  );
}
