import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, BarChart, Bar, LabelList, XAxis, YAxis, Tooltip } from 'recharts';
import { EmptyState, InfoHint } from '../../../../../../../components/ui/index';
import { fmtMoney } from '../../../../../../../lib/format';
import { ChartFrame } from '../../../shared/ChartFrame';
import { AXIS_X, TOOLTIP_STYLE, BAR_CURSOR, LINE_CURSOR, PEACH_LIGHT } from '../../../shared/chartTheme';
import { ZeroLabel } from '../../../shared/ZeroLabel';
import { zeroAwareCells } from '../../../shared/zeroAwareCells';

type LoadDim = 'weekday' | 'hour';
const LOAD_DIMS: LoadDim[] = ['weekday', 'hour'];

export interface TrainerChartsProps {
  revenueData: { period: string; label: string; value: number }[];
  loadWeekdayData: { weekday: number; label: string; lessons: number; fill_pct: number }[];
  loadHourData: { hour: number; label: string; lessons: number; fill_pct: number }[];
}

function SectionTitle({ text, description, hintKey }: { text: string; description?: string; hintKey: string }) {
  const { t } = useTranslation('reports');
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{text}</span>
        <InfoHint title={t(`formulas.${hintKey}.title`)} text={t(`formulas.${hintKey}.text`)} />
      </div>
      {description && (
        <p style={{ fontSize: '11.5px', lineHeight: 1.4, color: 'var(--text3)', margin: '3px 0 0' }}>{description}</p>
      )}
    </div>
  );
}

export function TrainerCharts({ revenueData, loadWeekdayData, loadHourData }: TrainerChartsProps) {
  const { t } = useTranslation('reports');
  const [dim, setDim] = useState<LoadDim>('weekday');
  const loadData: { label: string; lessons: number; fill_pct: number }[] = dim === 'weekday' ? loadWeekdayData : loadHourData;

  return (
    <>
      <div>
        <SectionTitle text={t('team.drawer.revenueByWeek')} hintKey="revenuePerHour" />
        {revenueData.length === 0 ? (
          <EmptyState size="sm" icon="chart" title={t('empty.noTrainerLessons')} />
        ) : (
          <ChartFrame height={160}>
            <AreaChart data={revenueData}>
              <XAxis dataKey="label" {...AXIS_X} />
              <YAxis hide />
              <Tooltip formatter={(v) => fmtMoney(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={LINE_CURSOR} />
              <defs>
                <linearGradient id="trainerRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FCAE91" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#FCAE91" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone" dataKey="value" stroke="#FCAE91" strokeWidth={2.5} fill="url(#trainerRevGrad)"
                activeDot={{ r: 4, fill: '#FCAE91', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ChartFrame>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <SectionTitle
            text={t(`team.drawer.loadBy${dim === 'weekday' ? 'Weekday' : 'Hour'}`)}
            description={t(`descriptions.team.load${dim === 'weekday' ? 'Weekday' : 'Hour'}`)}
            hintKey="occupancy"
          />
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.04)', borderRadius: '10px', padding: '3px', flexShrink: 0 }}>
            {LOAD_DIMS.map(d => (
              <button
                key={d}
                onClick={() => setDim(d)}
                style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font)',
                  background: dim === d ? '#fff' : 'transparent',
                  color: dim === d ? 'var(--text)' : 'var(--text3)',
                  boxShadow: dim === d ? '0 1px 6px rgba(26,26,26,0.1)' : 'none',
                }}
              >
                {t(`team.drawer.loadDim.${d}`)}
              </button>
            ))}
          </div>
        </div>
        {loadData.length === 0 ? (
          <EmptyState size="sm" icon="chart" title={t('empty.noTrainerLessons')} />
        ) : (
          <ChartFrame height={140}>
            <BarChart data={loadData}>
              <XAxis dataKey="label" {...AXIS_X} />
              <YAxis hide />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
              <Bar dataKey="fill_pct" fill={PEACH_LIGHT} radius={[6, 6, 0, 0]} maxBarSize={28} minPointSize={3} activeBar={false}>
                <LabelList dataKey="fill_pct" position="top" content={ZeroLabel} />
                {zeroAwareCells(loadData, 'fill_pct', PEACH_LIGHT)}
              </Bar>
            </BarChart>
          </ChartFrame>
        )}
      </div>
    </>
  );
}
