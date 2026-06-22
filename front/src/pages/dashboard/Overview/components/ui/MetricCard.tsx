import type { JSX, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MetricConfig } from '../../types';

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
};

interface Props {
  metric: MetricConfig;
  isActive: boolean;
  onSelect: () => void;
}

export default function MetricCard({ metric, isActive, onSelect }: Props) {
  const navigate = useNavigate();

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
          Подробнее ↗
        </div>
      )}

      <div className="stat-label">{metric.title}</div>
      <div className="stat-value">{metric.value}</div>
      <div className="stat-change up">{metric.change}</div>
    </div>
  );
}
