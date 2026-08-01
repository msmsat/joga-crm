import { useRef, useState } from 'react';
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

interface HoverState { index: number; left: number; top: number; }

/** ISO-дата бакета → короткая подпись бара. */
function barLabel(iso: string, period: Props['period'], locale: string): string {
  const d = new Date(iso);
  if (period === 'week') return d.toLocaleDateString(locale, { weekday: 'short' });
  if (period === 'month') return String(d.getDate());
  return d.toLocaleDateString(locale, { month: 'short' });
}

/** Бар под курсором по X (или ближайший, если курсор попал в зазор между барами). */
function barIndexAtX(bars: HTMLDivElement[], clientX: number): number {
  const rects = bars.map(b => b.getBoundingClientRect());
  const hit = rects.findIndex(r => clientX >= r.left && clientX < r.right);
  if (hit !== -1) return hit;
  return rects.reduce((best, r, i) => {
    const mid = r.left + r.width / 2;
    const bestMid = rects[best].left + rects[best].width / 2;
    return Math.abs(mid - clientX) < Math.abs(bestMid - clientX) ? i : best;
  }, 0);
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

  const [hover, setHover] = useState<HoverState | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Курсор двигается по всей колонке-«свече» (не только по видимому телу
  // бара) — иначе над короткими барами тултип гас и «дёргался». Прячем его
  // только когда курсор реально покинул #dash-chart (onMouseLeave контейнера).
  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const chart = container.closest('#dash-chart') as HTMLElement | null;
    const bars = Array.from(container.querySelectorAll<HTMLDivElement>('.bar'));
    if (!chart || bars.length === 0) return;

    const index = barIndexAtX(bars, e.clientX);
    const chartRect = chart.getBoundingClientRect();
    const barRect = bars[index].getBoundingClientRect();
    // ponytail: ширина/высота тултипа берутся из предыдущего рендера (контент
    // меняется только на 1 кадр раньше React) — расхождение в пару px для
    // коротких чисел незаметно, апгрейд — useLayoutEffect, если понадобится точнее.
    const tipW = tipRef.current?.offsetWidth ?? 0;
    const tipH = tipRef.current?.offsetHeight ?? 24;

    const centerX = barRect.left + barRect.width / 2;
    const clampedX = Math.min(Math.max(centerX, chartRect.left + tipW / 2), chartRect.right - tipW / 2);

    const margin = 12;
    const desiredTop = e.clientY - tipH - margin;
    const clampedTop = Math.min(Math.max(desiredTop, chartRect.top), chartRect.bottom - tipH);

    setHover({ index, left: clampedX - chartRect.left, top: clampedTop - chartRect.top });
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
          <div className="chart-bars-clip">
            <div className="chart-bars" onMouseMove={handleChartMouseMove} onMouseLeave={() => setHover(null)}>
              {series.map((p, i) => {
                const baseColor = activeConfig.glow;
                const hoverColor = activeConfig.color;
                const active = hover ? hover.index === i : i === series.length - 1;
                return (
                  <div
                    key={p.period}
                    className="bar"
                    style={{ height: `${Math.max(4, (p.value / max) * 100)}%`, background: active ? hoverColor : baseColor }}
                  />
                );
              })}
            </div>
          </div>
          {hover && (
            <div ref={tipRef} className="bar-tooltip" style={{ left: hover.left, top: hover.top, opacity: 1 }}>
              {fmt(series[hover.index].value)}
            </div>
          )}
          <div className="chart-labels">
            {series.map((p) => <div key={p.period} className="chart-label">{barLabel(p.period, period, i18n.language)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
