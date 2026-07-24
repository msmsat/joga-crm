import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Tooltip } from '../../../../../../components/ui/index';
import type { HeatmapCell } from '../../../types';

export interface HeatmapProps {
  cells: HeatmapCell[];
  onCellClick: (weekday: number, hour: number) => void;
}

// isodow (1=Пн..7=Вс) — колонки идут пн→вс в этом же порядке.
const WEEKDAYS_ISODOW = [1, 2, 3, 4, 5, 6, 7];

const STEPS = [
  { max: 0, bg: 'transparent' },
  { max: 25, bg: 'rgba(249,160,139,0.15)' },
  { max: 50, bg: 'rgba(249,160,139,0.38)' },
  { max: 75, bg: 'rgba(249,160,139,0.62)' },
  { max: 90, bg: 'rgba(249,160,139,0.82)' },
  { max: Infinity, bg: '#F9A08B' },
];

function stepColor(fillPct: number, lessons: number): string {
  if (lessons === 0) return 'transparent';
  const step = STEPS.find(s => fillPct <= s.max) ?? STEPS[STEPS.length - 1];
  return step.bg;
}

export function Heatmap({ cells, onCellClick }: HeatmapProps) {
  const { t } = useTranslation('reports');
  const weekdayLabels = t('schedule.weekdaysMonFirst', { returnObjects: true }) as string[];

  const { hours, byKey } = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    let minHour = 23;
    let maxHour = 0;
    for (const c of cells) {
      map.set(`${c.weekday}-${c.hour}`, c);
      minHour = Math.min(minHour, c.hour);
      maxHour = Math.max(maxHour, c.hour);
    }
    if (cells.length === 0) { minHour = 9; maxHour = 20; }
    const hrs: number[] = [];
    for (let h = minHour; h <= maxHour; h++) hrs.push(h);
    return { hours: hrs, byKey: map };
  }, [cells]);

  return (
    <Card padding={24}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `48px repeat(${WEEKDAYS_ISODOW.length}, minmax(52px, 1fr))`,
          gap: '4px',
          minWidth: '480px',
        }}>
          <div />
          {WEEKDAYS_ISODOW.map((wd, i) => (
            <div key={wd} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>
              {weekdayLabels[i]}
            </div>
          ))}

          {hours.map(hour => (
            <Fragment key={hour}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', alignSelf: 'center', textAlign: 'right', paddingRight: '4px' }}>
                {hour}:00
              </div>
              {WEEKDAYS_ISODOW.map(wd => {
                const cell = byKey.get(`${wd}-${hour}`);
                const fillPct = cell?.fill_pct ?? 0;
                const lessons = cell?.lessons ?? 0;
                const bg = stepColor(fillPct, lessons);
                const tooltipLabel = lessons > 0
                  ? t('schedule.heatmap.tooltip', { lessons, attendance: cell?.attendance ?? 0, pct: fillPct })
                  : t('schedule.heatmap.empty');
                return (
                  <Tooltip key={`${wd}-${hour}`} label={tooltipLabel}>
                    <button
                      onClick={() => lessons > 0 && onCellClick(wd, hour)}
                      disabled={lessons === 0}
                      style={{
                        width: '100%', aspectRatio: '1.4', borderRadius: '6px',
                        border: lessons === 0 ? '1px dashed var(--border)' : 'none',
                        background: bg, cursor: lessons > 0 ? 'pointer' : 'default',
                        fontSize: '11px', fontWeight: 700,
                        color: fillPct > 60 ? '#1A1A1A' : 'var(--text2)',
                        fontFamily: 'var(--font)', padding: 0,
                        transition: 'transform 0.15s ease',
                      }}
                      onMouseEnter={e => { if (lessons > 0) e.currentTarget.style.transform = 'scale(1.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                    >
                      {lessons > 0 ? `${Math.round(fillPct)}%` : ''}
                    </button>
                  </Tooltip>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)' }}>{t('schedule.heatmap.legend')}</span>
        {STEPS.slice(1).map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: s.bg, display: 'inline-block' }} />
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
              {i === 0 ? `0–${s.max}%` : `${STEPS[i].max}–${s.max === Infinity ? '100' : s.max}%`}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
