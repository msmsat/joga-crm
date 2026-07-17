import type { MetricConfig, SeriesPoint } from '../../types';
import { formatMoney } from '../../constants';

interface Props {
  activeConfig: MetricConfig;
  period: 'week' | 'month' | 'year';
  setPeriod: (p: 'week' | 'month' | 'year') => void;
  series: SeriesPoint[];
}

const PERIOD_LABEL: Record<Props['period'], string> = {
  week: 'по неделям', month: 'по месяцам', year: 'по месяцам',
};
const PERIOD_SUB: Record<Props['period'], string> = {
  week: 'Последние 8 недель', month: 'Последние 8 месяцев', year: 'Последние 12 месяцев',
};

/** ISO-дата бакета → короткая подпись бара. */
function barLabel(iso: string, period: Props['period']): string {
  const d = new Date(iso);
  if (period === 'week') return `${d.getDate()}/${d.getMonth() + 1}`;
  return d.toLocaleDateString('ru-RU', { month: 'short' });
}

export default function AnalyticsChart({ activeConfig, period, setPeriod, series }: Props) {
  const hasSeries = activeConfig.id !== 'retention';
  const max = Math.max(1, ...series.map(p => p.value));
  const fmt = (v: number) => (activeConfig.id === 'revenue' ? formatMoney(v) : String(v));

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>
            {activeConfig.title.replace(' за месяц', '').replace(' сегодня', '')} {PERIOD_LABEL[period]}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{PERIOD_SUB[period]}</div>
        </div>

        <div className="tabs" style={{ marginBottom: 0 }}>
          <div className={`tab ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>Нед.</div>
          <div className={`tab ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>Мес.</div>
          <div className={`tab ${period === 'year' ? 'active' : ''}`} onClick={() => setPeriod('year')}>Год</div>
        </div>
      </div>

      {!hasSeries ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
          График по удержанию недоступен
        </div>
      ) : series.length === 0 ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
          Нет данных за период
        </div>
      ) : (
        <div id="dash-chart">
          <div className="chart-bars">
            {series.map((p, i) => {
              const baseColor = activeConfig.glow;
              const hoverColor = activeConfig.color;
              const last = i === series.length - 1;
              return (
                <div
                  key={p.period}
                  className="bar"
                  style={{ height: `${Math.max(4, (p.value / max) * 100)}%`, background: last ? hoverColor : baseColor }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = hoverColor)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = last ? hoverColor : baseColor)}
                >
                  <div className="bar-tooltip">{fmt(p.value)}</div>
                </div>
              );
            })}
          </div>
          <div className="chart-labels">
            {series.map((p) => <div key={p.period} className="chart-label">{barLabel(p.period, period)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
