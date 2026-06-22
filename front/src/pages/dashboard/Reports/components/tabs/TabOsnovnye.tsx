import type { Period } from '../../types';
import { useReportData } from '../../hooks/useReportData';
import { SummaryMetrics } from '../SummaryMetrics';
import { RevenueChart } from '../charts/RevenueChart';
import { AttendanceChart } from '../charts/AttendanceChart';
import { ProgressBar } from '../ProgressBar';

const INCOME_STRUCTURE = [
  { color: '#FCAE91', label: 'Абонементы', pct: 59, val: '₽167K' },
  { color: '#5BAB72', label: 'Разовые',    pct: 24, val: '₽68K'  },
  { color: '#4A80C4', label: 'Доп. услуги',pct: 15, val: '₽43K'  },
  { color: '#f0c040', label: 'Товары',      pct: 2,  val: '₽6K'   },
];

const QUALITY_ITEMS = [
  { label: 'NPS',       value: '72',  sub: 'Net Promoter Score',  color: '#5BAB72',     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg> },
  { label: 'Загрузка',  value: '78%', sub: 'Зал занят в среднем', color: 'var(--accent)',icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
  { label: 'Рейтинг',   value: '4.8', sub: '214 отзыва',          color: '#f0c040',     icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="#f0c040" stroke="#f0c040" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
  { label: 'Отменено',  value: '4.2%',sub: 'Занятий отменено',   color: '#D88C9A',     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg> },
];

export interface TabOsnovnyeProps {
  period: Period;
}

export function TabOsnovnye({ period }: TabOsnovnyeProps) {
  const { fmtRevenue, multiplier } = useReportData(period);

  return (
    <>
      <SummaryMetrics period={period} fmtRevenue={fmtRevenue} multiplier={multiplier}/>

      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <RevenueChart period={period}/>
        <AttendanceChart period={period}/>
      </div>

      {/* Income structure */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Структура доходов</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <svg width="150" height="150" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="52" fill="none" stroke="rgba(252,174,145,0.1)" strokeWidth="18"/>
            <circle cx="70" cy="70" r="52" fill="none" stroke="#FCAE91" strokeWidth="18" strokeDasharray="196 130" strokeLinecap="round" transform="rotate(-90 70 70)"/>
            <circle cx="70" cy="70" r="52" fill="none" stroke="#5BAB72" strokeWidth="18" strokeDasharray="80 246"  strokeLinecap="round" transform="rotate(63 70 70)"/>
            <circle cx="70" cy="70" r="52" fill="none" stroke="#4A80C4" strokeWidth="18" strokeDasharray="50 276"  strokeLinecap="round" transform="rotate(152 70 70)"/>
            <circle cx="70" cy="70" r="52" fill="none" stroke="#f0c040" strokeWidth="18" strokeDasharray="6 320"   strokeLinecap="round" transform="rotate(207 70 70)"/>
            <text x="70" y="66" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Manrope" fill="var(--text)">₽284K</text>
            <text x="70" y="82" textAnchor="middle" fontSize="10" fill="#999" fontFamily="Manrope">всего</text>
          </svg>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {INCOME_STRUCTURE.map(({ color, label, pct, val }) => (
              <div key={label} style={{ background: 'var(--bg)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border)', transition: 'all 0.2s', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, flexShrink: 0 }}/>
                  <span style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800 }}>{val}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{pct}% от общего</div>
                <ProgressBar value={pct} color={color} height={3}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quality metrics */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Показатели качества</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {QUALITY_ITEMS.map(({ label, value, sub, color, icon }) => (
            <div key={label} style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', border: '1px solid var(--border)', textAlign: 'center', transition: 'all 0.2s', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px', color }}>{icon}</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color, letterSpacing: '-0.5px' }}>{value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px', fontWeight: 600 }}>{sub}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', opacity: 0.7, marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
