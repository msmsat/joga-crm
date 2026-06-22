import type { MetricConfig } from '../../types';

interface Props {
  activeConfig: MetricConfig;
  period: 'week' | 'month' | 'year';
  setPeriod: (p: 'week' | 'month' | 'year') => void;
  labels: string[];
  vals: number[];
  periodLabel: string;
  periodSubLabel: string;
}

export default function AnalyticsChart({ activeConfig, period, setPeriod, labels, vals, periodLabel, periodSubLabel }: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>
            {activeConfig.title.replace(' за месяц', '').replace(' сегодня', '')} {periodLabel}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{periodSubLabel}</div>
        </div>

        <div className="tabs" style={{ marginBottom: 0 }}>
          <div className={`tab ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>Нед.</div>
          <div className={`tab ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>Мес.</div>
          <div className={`tab ${period === 'year' ? 'active' : ''}`} onClick={() => setPeriod('year')}>Год</div>
        </div>
      </div>

      <div id="dash-chart">
        <div className="chart-bars">
          {labels.map((_, i) => {
            const baseColor = activeConfig.glow;
            const hoverColor = activeConfig.color;
            return (
              <div
                key={i}
                className="bar"
                style={{ height: `${vals[i]}%`, background: i === 7 ? hoverColor : baseColor }}
                onMouseEnter={(e) => (e.currentTarget.style.background = hoverColor)}
                onMouseLeave={(e) => (e.currentTarget.style.background = i === 7 ? hoverColor : baseColor)}
              >
                <div className="bar-tooltip">{activeConfig.formatTooltip(vals[i])}</div>
              </div>
            );
          })}
        </div>
        <div className="chart-labels">
          {labels.map((lbl, i) => <div key={i} className="chart-label">{lbl}</div>)}
        </div>
      </div>
    </div>
  );
}
