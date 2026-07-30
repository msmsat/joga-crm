import { useTranslation } from 'react-i18next';
import type { MetricConfig, SeriesPoint } from '../../types';
import { fmtMoneyCompact } from '../../../../../lib/format';

interface Props {
  activeConfig: MetricConfig;
  period: 'week' | 'month' | 'year';
  setPeriod: (p: 'week' | 'month' | 'year') => void;
  series: SeriesPoint[];
  currencySymbol: string;
}

/** ISO-дата бакета → короткая подпись бара. */
function barLabel(iso: string, period: Props['period'], locale: string): string {
  const d = new Date(iso);
  if (period === 'week') return d.toLocaleDateString(locale, { weekday: 'short' });
  if (period === 'month') return String(d.getDate());
  return d.toLocaleDateString(locale, { month: 'short' });
}

/** Центрируем тултип над баром; если бар у́же тултипа и центр вылезает за
 * #dash-chart (обрезается его overflow-x), прижимаем к внутреннему краю. */
function positionTooltip(bar: HTMLDivElement) {
  const chart = bar.closest('#dash-chart') as HTMLElement | null;
  const tip = bar.querySelector<HTMLDivElement>('.bar-tooltip');
  if (!chart || !tip) return;
  const chartRect = chart.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  const half = tip.offsetWidth / 2;
  const center = barRect.left + barRect.width / 2;
  const clamped = Math.min(Math.max(center, chartRect.left + half), chartRect.right - half);
  tip.style.left = `${clamped - barRect.left}px`;
  tip.style.transform = 'translate(-50%, -4px)';
}

function resetTooltip(bar: HTMLDivElement) {
  const tip = bar.querySelector<HTMLDivElement>('.bar-tooltip');
  if (tip) { tip.style.left = ''; tip.style.transform = ''; }
}

export default function AnalyticsChart({ activeConfig, period, setPeriod, series, currencySymbol }: Props) {
  const { t, i18n } = useTranslation('dashboard');
  const hasSeries = activeConfig.id !== 'retention';
  const max = Math.max(1, ...series.map(p => p.value));
  const fmt = (v: number) => (activeConfig.id === 'revenue' ? fmtMoneyCompact(v, currencySymbol) : String(v));

  const periodLabel: Record<Props['period'], string> = {
    week: t('chart.byDay'), month: t('chart.byDay'), year: t('chart.byMonth'),
  };
  const periodSub: Record<Props['period'], string> = {
    week: t('chart.subWeek'), month: t('chart.subMonth'), year: t('chart.subYear'),
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>
            {activeConfig.title.replace(' за месяц', '').replace(' сегодня', '')} {periodLabel[period]}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{periodSub[period]}</div>
        </div>

        <div className="tabs" style={{ marginBottom: 0 }}>
          <div className={`tab ${period === 'week' ? 'active' : ''}`} onClick={() => setPeriod('week')}>{t('chart.tabWeek')}</div>
          <div className={`tab ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>{t('chart.tabMonth')}</div>
          <div className={`tab ${period === 'year' ? 'active' : ''}`} onClick={() => setPeriod('year')}>{t('chart.tabYear')}</div>
        </div>
      </div>

      {!hasSeries ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
          {t('chart.retentionNA')}
        </div>
      ) : series.length === 0 ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
          {t('chart.noData')}
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = hoverColor; positionTooltip(e.currentTarget); }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = last ? hoverColor : baseColor; resetTooltip(e.currentTarget); }}
                >
                  <div className="bar-tooltip">{fmt(p.value)}</div>
                </div>
              );
            })}
          </div>
          <div className="chart-labels">
            {series.map((p) => <div key={p.period} className="chart-label">{barLabel(p.period, period, i18n.language)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
