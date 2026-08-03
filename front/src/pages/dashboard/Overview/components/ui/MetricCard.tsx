import type { JSX, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fmtPct } from '../../../../../lib/format';
import type { MetricConfig } from '../../types';
import styles from '../../Overview.module.css';

const ICONS: Record<string, JSX.Element> = {
  revenue: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  clients: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  bookings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A80C4" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  retention: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  // ── Личные метрики админа и тренера (GET /analytics/me) ──
  lessons: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A80C4" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  ),
  attendance: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5V12a9 9 0 1 1-5.3-8.2" />
      <path d="M9 11.5l3 3L21.5 5" />
    </svg>
  ),
  fill_rate: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round">
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4.5-5" />
    </svg>
  ),
  rating: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  ),
};

// «Активных клиентов» админа — та же метрика, что у владельца: и иконка та же.
ICONS.active_clients = ICONS.clients;

interface Props {
  metric: MetricConfig;
  isActive: boolean;
  onSelect: () => void;
  /** Сводка ещё едет: показываем шиммер вместо нулей, чтобы не мигнуть ложным «0 ₽». */
  loading?: boolean;
}

export default function MetricCard({ metric, isActive, onSelect, loading }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation('dashboard');

  return (
    <div
      className={`stat-card ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      style={{
        '--active-color': metric.color,
        '--active-glow': metric.glow,
      } as CSSProperties}
    >
      <div className="stat-icon" style={{ background: metric.glow }}>
        {ICONS[metric.id]}
      </div>

      {isActive && (
        <div
          className="stat-more-btn"
          onClick={(e) => {
            e.stopPropagation();
            navigate(metric.route);
          }}
        >
          {t('metrics.more')} ↗
        </div>
      )}

      <div className="stat-label">{metric.title}</div>
      {loading ? (
        <div className={styles.skel} style={{ width: '96px', height: '30px', margin: '2px 0 6px' }} />
      ) : (
        <div className="stat-value">{metric.value}</div>
      )}
      {!loading && metric.changePct !== null && (
        <div className={`stat-change ${metric.changePct >= 0 ? 'up' : 'down'}`}>
          {fmtPct(metric.changePct)}
        </div>
      )}
    </div>
  );
}
