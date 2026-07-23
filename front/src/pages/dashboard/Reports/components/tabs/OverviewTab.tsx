import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { CategoricalChartFunc } from 'recharts/types/chart/types';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { financesApi } from '../../../../../api/finances';
import { scheduleApi } from '../../../../../api/schedule';
import { queryKeys } from '../../../../../api/queryKeys';
import { fmtMoney, fmtInt } from '../../../../../lib/format';
import { KpiStat } from '../shared/KpiStat';
import { ChartCard } from '../shared/ChartCard';
import { InsightsPanel } from '../shared/InsightsPanel';
import { DrilldownModal } from '../shared/DrilldownModal';
import type { DrilldownColumn } from '../shared/DrilldownModal';
import { RevenueStructureCard } from './overview/RevenueStructureCard';
import { ClientDynamicsCard } from './overview/ClientDynamicsCard';
import type { ReportFiltersParams } from '../../types';

export interface OverviewTabProps {
  params: ReportFiltersParams;
  paramsKey: string;
  registerCsvExport: (rows: Record<string, unknown>[]) => void;
}

type ChartMetric = 'revenue' | 'profit' | 'attendance' | 'new_clients' | 'fill_rate';

const CHART_METRICS: ChartMetric[] = ['revenue', 'profit', 'attendance', 'new_clients', 'fill_rate'];
const MONEY_METRICS: ChartMetric[] = ['revenue', 'profit'];

interface DayDrilldown {
  kind: 'money' | 'lessons';
  date: string;
}

function fmtDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export function OverviewTab({ params, paramsKey, registerCsvExport }: OverviewTabProps) {
  const { t, i18n } = useTranslation('reports');
  const navigate = useNavigate();
  const [chartMetric, setChartMetric] = useState<ChartMetric>('revenue');
  const [drilldown, setDrilldown] = useState<DayDrilldown | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.report('overview', paramsKey),
    queryFn: () => analyticsApi.getOverview(params),
    placeholderData: prev => prev,
  });

  const { data: series = [] } = useQuery({
    queryKey: queryKeys.reportSeries(chartMetric, paramsKey),
    queryFn: () => analyticsApi.getSeries({ ...params, metric: chartMetric, group: 'day' }),
    placeholderData: prev => prev,
  });

  const chartData = useMemo(
    () => series.map(p => ({ period: p.period, label: fmtDay(p.period), value: p.value })),
    [series],
  );

  const drilldownDate = drilldown?.date ?? '';
  const { data: dayOperations, isFetching: opsLoading } = useQuery({
    queryKey: queryKeys.finOperations(`overview-day-${drilldownDate}`),
    queryFn: () => financesApi.getOperations({ date_from: drilldownDate, date_to: drilldownDate }),
    enabled: !!drilldown && drilldown.kind === 'money',
  });

  const { data: dayLessons, isFetching: lessonsLoading } = useQuery({
    queryKey: queryKeys.journalLessons(drilldownDate, drilldownDate),
    queryFn: () => scheduleApi.getLessons({ date_from: drilldownDate, date_to: drilldownDate }),
    enabled: !!drilldown && drilldown.kind === 'lessons',
  });

  const kpi = data?.kpi;

  const csvRows = useMemo((): Record<string, unknown>[] => {
    if (!data) return [];
    return [
      { metric: 'revenue', value: data.kpi.revenue.value, prev_pct: data.kpi.revenue.prev_pct ?? '' },
      { metric: 'profit', value: data.kpi.profit.value, prev_pct: data.kpi.profit.prev_pct ?? '' },
      { metric: 'attendance', value: data.kpi.attendance.value, prev_pct: data.kpi.attendance.prev_pct ?? '' },
      { metric: 'active_clients', value: data.kpi.active_clients.value, prev_pct: data.kpi.active_clients.prev_pct ?? '' },
      { metric: 'fill_rate', value: data.kpi.fill_rate.value, prev_pct: data.kpi.fill_rate.prev_pct ?? '' },
      ...data.revenue_structure.map(r => ({ metric: `revenue_structure:${r.category}`, value: r.amount, prev_pct: r.share_pct })),
      { metric: 'clients_new', value: data.client_dynamics.new.value, prev_pct: data.client_dynamics.new.prev_pct ?? '' },
      { metric: 'clients_returned', value: data.client_dynamics.returned.value, prev_pct: data.client_dynamics.returned.prev_pct ?? '' },
      { metric: 'clients_lost', value: data.client_dynamics.lost.value, prev_pct: data.client_dynamics.lost.prev_pct ?? '' },
    ];
  }, [data]);

  useEffect(() => {
    registerCsvExport(csvRows);
  }, [csvRows, registerCsvExport]);

  const openDayDrilldown = (period: string) => {
    setDrilldown({ kind: MONEY_METRICS.includes(chartMetric) ? 'money' : 'lessons', date: period });
  };

  // Recharts (v3) не даёт в onClick сам payload точки, только индекс тика —
  // достаём period из chartData по activeTooltipIndex.
  const handleChartClick: CategoricalChartFunc = (nextState) => {
    const idx = nextState.activeTooltipIndex;
    if (typeof idx === 'number' && chartData[idx]) openDayDrilldown(chartData[idx].period);
  };

  const operationColumns: DrilldownColumn[] = [
    { key: 'title', label: t('overview.drilldown.title') },
    { key: 'category', label: t('overview.drilldown.category') },
    { key: 'amount', label: t('overview.drilldown.amount') },
  ];
  const operationRows = (dayOperations?.items ?? []).map(op => ({
    title: op.title,
    category: op.category ?? '',
    amount: fmtMoney(op.type === 'in' ? op.amount : -op.amount),
  }));

  const lessonColumns: DrilldownColumn[] = [
    { key: 'name', label: t('overview.drilldown.lesson') },
    { key: 'time', label: t('overview.drilldown.time') },
    { key: 'occupancy', label: t('overview.drilldown.occupancy') },
  ];
  const lessonRows = (dayLessons ?? []).map(l => ({
    name: l.name,
    time: new Date(l.start_time).toLocaleTimeString(i18n.language === 'en' ? 'en-US' : 'ru-RU', { hour: '2-digit', minute: '2-digit' }),
    occupancy: `${l.booked_count}/${l.total_spots}`,
  }));

  return (
    <>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '20px' }}>
        <KpiStat
          label={t('overview.kpi.revenue')}
          value={kpi?.revenue.value ?? 0}
          trendPct={kpi?.revenue.prev_pct ?? null}
          formulaKey="revenue"
          format="money"
          onClick={() => setChartMetric('revenue')}
        />
        <KpiStat
          label={t('overview.kpi.profit')}
          value={kpi?.profit.value ?? 0}
          trendPct={kpi?.profit.prev_pct ?? null}
          formulaKey="profit"
          format="money"
          onClick={() => navigate('/dashboard/finances?tab=operations')}
        />
        <KpiStat
          label={t('overview.kpi.attendance')}
          value={kpi?.attendance.value ?? 0}
          trendPct={kpi?.attendance.prev_pct ?? null}
          formulaKey="attendance"
          format="int"
          onClick={() => setChartMetric('attendance')}
        />
        <KpiStat
          label={t('overview.kpi.activeClients')}
          value={kpi?.active_clients.value ?? 0}
          trendPct={kpi?.active_clients.prev_pct ?? null}
          formulaKey="activeClients"
          format="int"
          onClick={() => navigate('/dashboard/reports?tab=clients')}
        />
        <KpiStat
          label={t('overview.kpi.fillRate')}
          value={kpi?.fill_rate.value ?? 0}
          trendPct={kpi?.fill_rate.prev_pct ?? null}
          formulaKey="occupancy"
          format="pct"
          onClick={() => setChartMetric('fill_rate')}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <ChartCard
          title={t('overview.chart.title')}
          formulaKey={chartMetric === 'fill_rate' ? 'occupancy' : chartMetric === 'new_clients' ? 'newClients' : chartMetric}
          actions={
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.04)', borderRadius: '10px', padding: '3px' }}>
              {CHART_METRICS.map(m => (
                <button
                  key={m}
                  onClick={() => setChartMetric(m)}
                  style={{
                    padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font)',
                    background: chartMetric === m ? '#fff' : 'transparent',
                    color: chartMetric === m ? 'var(--text)' : 'var(--text3)',
                    boxShadow: chartMetric === m ? '0 1px 6px rgba(26,26,26,0.1)' : 'none',
                  }}
                >
                  {t(`overview.chart.metric.${m}`)}
                </button>
              ))}
            </div>
          }
        >
          <div style={{ height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              {MONEY_METRICS.includes(chartMetric) ? (
                <AreaChart data={chartData} onClick={handleChartClick}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => fmtMoney(Number(v))}
                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--bg-card)' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#FCAE91" fill="rgba(252,174,145,0.25)" strokeWidth={2} />
                </AreaChart>
              ) : (
                <BarChart data={chartData} onClick={handleChartClick}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => (chartMetric === 'fill_rate' ? `${v}%` : fmtInt(Number(v)))}
                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--bg-card)' }}
                  />
                  <Bar dataKey="value" fill="#FCAE91" radius={[6, 6, 0, 0]} maxBarSize={28} cursor="pointer" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <RevenueStructureCard
          rows={data?.revenue_structure ?? []}
          onCategoryClick={() => navigate('/dashboard/finances?tab=operations')}
        />
        <ClientDynamicsCard
          dynamics={data?.client_dynamics ?? { new: { value: 0, prev_pct: null }, returned: { value: 0, prev_pct: null }, lost: { value: 0, prev_pct: null } }}
          onClick={() => navigate('/dashboard/reports?tab=clients')}
        />
      </div>

      <InsightsPanel insights={data?.insights ?? []} />

      <DrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown ? fmtDay(drilldown.date) : ''}
        columns={drilldown?.kind === 'money' ? operationColumns : lessonColumns}
        rows={drilldown?.kind === 'money' ? operationRows : lessonRows}
        loading={drilldown?.kind === 'money' ? opsLoading : lessonsLoading}
      />
    </>
  );
}
