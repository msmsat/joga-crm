import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, BarChart, Bar, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts';
import type { CategoricalChartFunc } from 'recharts/types/chart/types';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { financesApi } from '../../../../../api/finances';
import { scheduleApi } from '../../../../../api/schedule';
import { queryKeys } from '../../../../../api/queryKeys';
import { fmtMoney, fmtInt, fmtBucket } from '../../../../../lib/format';
import { groupForRange } from '../../hooks/useReportFilters';
import { KpiStat } from '../shared/KpiStat';
import { ChartCard } from '../shared/ChartCard';
import { ChartFrame } from '../shared/ChartFrame';
import { AXIS_X, BAR_CURSOR, LINE_CURSOR, PEACH, PEACH_LIGHT, ROSE } from '../shared/chartTheme';
import { ChartTooltip } from '../shared/ChartTooltip';
import { ZeroLabel } from '../shared/ZeroLabel';
import { zeroAwareCells } from '../shared/zeroAwareCells';
import { MainWithInsights } from '../shared/MainWithInsights';
import { DrilldownModal } from '../shared/DrilldownModal';
import type { DrilldownColumn } from '../shared/DrilldownModal';
import { EmptyTabState } from '../shared/EmptyTabState';
import { isAllZero } from '../../hooks/useIsEmpty';
import { useScopeNote } from '../../hooks/useScopeNote';
import { RevenueStructureCard } from './overview/RevenueStructureCard';
import { ClientDynamicsCard } from './overview/ClientDynamicsCard';
import type { ReportFiltersParams } from '../../types';

export interface OverviewTabProps {
  params: ReportFiltersParams;
  paramsKey: string;
  registerCsvExport: (rows: Record<string, unknown>[]) => void;
  onWidenPeriod: () => void;
}

type ChartMetric = 'revenue' | 'profit' | 'attendance' | 'new_clients' | 'fill_rate';

const CHART_METRICS: ChartMetric[] = ['revenue', 'profit', 'attendance', 'new_clients', 'fill_rate'];
const MONEY_METRICS: ChartMetric[] = ['revenue', 'profit'];
const FORMULA_BY_METRIC: Record<ChartMetric, string> = {
  revenue: 'revenue',
  profit: 'profit',
  attendance: 'attendance',
  new_clients: 'newClients',
  fill_rate: 'occupancy',
};

interface DayDrilldown {
  kind: 'money' | 'lessons';
  date: string;
}

export function OverviewTab({ params, paramsKey, registerCsvExport, onWidenPeriod }: OverviewTabProps) {
  const { t, i18n } = useTranslation('reports');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [chartMetric, setChartMetric] = useState<ChartMetric>('revenue');
  const [drilldown, setDrilldown] = useState<DayDrilldown | null>(null);
  const moneyScopeNote = useScopeNote('money');

  const { data } = useQuery({
    queryKey: queryKeys.report('overview', paramsKey),
    queryFn: () => analyticsApi.getOverview(params),
    placeholderData: prev => prev,
  });

  // revenue/profit не поддерживают почасовую разбивку — у Operation нет
  // времени суток, только дата (back/routers/analytics/reports.py). На
  // однодневном периоде для этих метрик остаёмся на 'day'.
  const rangeGroup = groupForRange(params.date_from, params.date_to);
  const chartGroup = rangeGroup === 'hour' && MONEY_METRICS.includes(chartMetric) ? 'day' : rangeGroup;

  const { data: series = [] } = useQuery({
    queryKey: queryKeys.reportSeries(chartMetric, `${paramsKey}-${chartGroup}`),
    queryFn: () => analyticsApi.getSeries({ ...params, metric: chartMetric, group: chartGroup }),
    placeholderData: prev => prev,
  });

  const chartData = useMemo(
    () => series.map(p => ({ period: p.period, label: fmtBucket(p.period, chartGroup), value: p.value })),
    [series, chartGroup],
  );

  // Точка на шкале 0..1, где линия пересекает 0 — граница между заливкой
  // прибыли (персик) и убытка (розовый) в одном градиенте.
  const profitGradientOffset = useMemo(() => {
    if (chartData.length === 0) return 1;
    const values = chartData.map(p => p.value);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    if (min >= 0) return 1;
    if (max <= 0) return 0;
    return max / (max - min);
  }, [chartData]);

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
  const isEmpty = !!data && isAllZero(
    [data.kpi.revenue.value, data.kpi.profit.value, data.kpi.attendance.value, data.kpi.active_clients.value, data.kpi.fill_rate.value],
    [data.revenue_structure],
  );

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

  // Переход на вкладку «Клиенты» с сохранением текущего периода/фильтров.
  const gotoClientsTab = (segment?: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'clients');
    if (segment) next.set('segment', segment);
    else next.delete('segment');
    // replace: остальные переходы внутри Отчётов (вкладки, период, фильтры) тоже
    // не плодят историю — «Назад» должен уводить со страницы Отчётов целиком.
    navigate(`/dashboard/reports?${next.toString()}`, { replace: true });
  };

  // Recharts (v3) не даёт в onClick сам payload точки, только индекс тика —
  // достаём period из chartData по activeTooltipIndex. Часовой бакет — не дата,
  // drilldown по дню для него не имеет смысла (эндпоинты дня ждут date_from/to).
  const handleChartClick: CategoricalChartFunc = (nextState) => {
    if (chartGroup === 'hour') return;
    const idx = nextState.activeTooltipIndex;
    if (typeof idx !== 'number' || !chartData[idx] || !chartData[idx].value) return;
    openDayDrilldown(chartData[idx].period);
  };

  const operationColumns: DrilldownColumn[] = [
    { key: 'title', label: t('overview.drilldown.title') },
    { key: 'category', label: t('overview.drilldown.category') },
    { key: 'amount', label: t('overview.drilldown.amount'), align: 'right' },
  ];
  const operationRows = (dayOperations?.items ?? []).map(op => ({
    _id: op.id,
    title: op.title,
    category: op.category ? t(`overview.category.${op.category}`, op.category) : '—',
    amount: fmtMoney(op.type === 'in' ? op.amount : -op.amount),
  }));

  // Агрегаты левой панели — по сырым операциям дня, а не по строкам таблицы
  // (в них суммы уже отформатированы в текст).
  const moneySummary = useMemo(() => {
    const items = dayOperations?.items ?? [];
    const income = items.filter(op => op.type === 'in').reduce((s, op) => s + op.amount, 0);
    const expense = items.filter(op => op.type === 'out').reduce((s, op) => s + op.amount, 0);
    return { income, expense, net: income - expense, count: items.length };
  }, [dayOperations]);

  const lessonColumns: DrilldownColumn[] = [
    { key: 'name', label: t('overview.drilldown.lesson') },
    { key: 'time', label: t('overview.drilldown.time') },
    { key: 'trainer', label: t('overview.drilldown.trainer') },
    { key: 'occupancy', label: t('overview.drilldown.occupancy'), align: 'right' },
  ];
  const lessonRows = (dayLessons ?? []).map(l => ({
    _id: l.id,
    name: l.name,
    time: new Date(l.start_time).toLocaleTimeString(i18n.language === 'en' ? 'en-US' : 'ru-RU', { hour: '2-digit', minute: '2-digit' }),
    trainer: l.teacher_name ?? '—',
    occupancy: `${l.booked_count}/${l.total_spots}`,
  }));

  const lessonSummary = useMemo(() => {
    const items = dayLessons ?? [];
    const spots = items.reduce((s, l) => s + l.total_spots, 0);
    const booked = items.reduce((s, l) => s + l.booked_count, 0);
    return {
      count: items.length,
      booked,
      spots,
      fillPct: spots ? Math.round((booked / spots) * 100) : 0,
      cancelled: items.filter(l => l.status === 'cancelled').length,
    };
  }, [dayLessons]);

  if (isEmpty) {
    return <EmptyTabState icon="chart" onWiden={onWidenPeriod} />;
  }

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
          scopeNote={moneyScopeNote}
        />
        <KpiStat
          label={t('overview.kpi.profit')}
          value={kpi?.profit.value ?? 0}
          trendPct={kpi?.profit.prev_pct ?? null}
          formulaKey="profit"
          format="money"
          onClick={() => setChartMetric('profit')}
          scopeNote={moneyScopeNote}
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
          onClick={() => gotoClientsTab('active')}
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

      <MainWithInsights insights={data?.insights ?? []}>
        <ChartCard
          title={t(`overview.chart.metric.${chartMetric}`)}
          description={t(`descriptions.overview.metric.${chartMetric}`)}
          formulaKey={FORMULA_BY_METRIC[chartMetric]}
          actions={
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(var(--ink),0.04)', borderRadius: '10px', padding: '3px' }}>
              {CHART_METRICS.map(m => (
                <button
                  key={m}
                  onClick={() => setChartMetric(m)}
                  style={{
                    padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font)',
                    background: chartMetric === m ? 'var(--bg-card)' : 'transparent',
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
          {MONEY_METRICS.includes(chartMetric) ? (
            <ChartFrame>
              <AreaChart data={chartData} onClick={handleChartClick} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="overviewMoneyFill" x1="0" y1="0" x2="0" y2="1">
                    {chartMetric === 'profit' ? (
                      <>
                        <stop offset={profitGradientOffset} stopColor={PEACH} stopOpacity={0.38} />
                        <stop offset={profitGradientOffset} stopColor={ROSE} stopOpacity={0.22} />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor={PEACH} stopOpacity={0.38} />
                        <stop offset="100%" stopColor={PEACH} stopOpacity={0} />
                      </>
                    )}
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(var(--ink),0.05)" />
                <XAxis dataKey="label" {...AXIS_X} interval="preserveStartEnd" minTickGap={16} />
                <YAxis hide domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']} />
                <ChartTooltip formatter={(v) => fmtMoney(Number(v))} cursor={LINE_CURSOR} />
                {chartMetric === 'profit' && <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />}
                <Area
                  type="monotone" dataKey="value" stroke={PEACH} strokeWidth={2.5}
                  fill="url(#overviewMoneyFill)" fillOpacity={1}
                  activeDot={{ r: 4, fill: '#fff', stroke: PEACH, strokeWidth: 2.5 }}
                  dot={chartData.length <= 12 ? { r: 2.5, fill: '#fff', stroke: PEACH, strokeWidth: 2 } : false}
                  animationDuration={400}
                />
              </AreaChart>
            </ChartFrame>
          ) : (
            <ChartFrame>
              <BarChart data={chartData} onClick={handleChartClick}>
                <XAxis dataKey="label" {...AXIS_X} />
                <YAxis hide />
                <ChartTooltip
                  formatter={(v) => (chartMetric === 'fill_rate' ? `${v}%` : fmtInt(Number(v)))}
                  cursor={BAR_CURSOR}
                />
                <Bar dataKey="value" fill={PEACH_LIGHT} radius={[6, 6, 0, 0]} maxBarSize={28} minPointSize={3} cursor="pointer" activeBar={false} animationDuration={400}>
                  <LabelList dataKey="value" position="top" content={ZeroLabel} />
                  {zeroAwareCells(chartData, 'value', PEACH_LIGHT)}
                </Bar>
              </BarChart>
            </ChartFrame>
          )}
        </ChartCard>
      </MainWithInsights>

      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <RevenueStructureCard
          rows={data?.revenue_structure ?? []}
          onCategoryClick={() => navigate('/dashboard/finances?tab=operations')}
        />
        <ClientDynamicsCard
          dynamics={data?.client_dynamics ?? { new: { value: 0, prev_pct: null }, returned: { value: 0, prev_pct: null }, lost: { value: 0, prev_pct: null } }}
          onClick={() => gotoClientsTab()}
        />
      </div>

      <DrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown ? fmtBucket(drilldown.date, 'day') : ''}
        subtitle={drilldown ? t(`overview.drilldown.subtitle.${drilldown.kind}`) : undefined}
        icon={drilldown?.kind === 'money' ? 'money' : 'calendar'}
        hero={drilldown?.kind === 'money'
          ? { value: fmtMoney(moneySummary.net), label: t('overview.drilldown.stat.net') }
          : { value: fmtInt(lessonSummary.count), label: t('overview.drilldown.stat.lessons') }}
        stats={drilldown?.kind === 'money'
          ? [
            { label: t('overview.drilldown.stat.income'), value: fmtMoney(moneySummary.income), tone: 'positive' as const },
            { label: t('overview.drilldown.stat.expense'), value: fmtMoney(moneySummary.expense), tone: 'negative' as const },
            { label: t('overview.drilldown.stat.operations'), value: fmtInt(moneySummary.count) },
          ]
          : [
            { label: t('overview.drilldown.stat.booked'), value: `${fmtInt(lessonSummary.booked)} / ${fmtInt(lessonSummary.spots)}` },
            { label: t('overview.drilldown.stat.avgFill'), value: `${lessonSummary.fillPct}%` },
            { label: t('overview.drilldown.stat.cancelled'), value: fmtInt(lessonSummary.cancelled), tone: lessonSummary.cancelled ? 'negative' as const : undefined },
          ]}
        rowHint={t(`overview.drilldown.hint.${drilldown?.kind === 'money' ? 'operations' : 'lessons'}`)}
        exportName={drilldown ? `${drilldown.kind}-${drilldown.date}` : undefined}
        columns={drilldown?.kind === 'money' ? operationColumns : lessonColumns}
        rows={drilldown?.kind === 'money' ? operationRows : lessonRows}
        loading={drilldown?.kind === 'money' ? opsLoading : lessonsLoading}
        onRowClick={row => {
          if (drilldown?.kind === 'money') navigate(`/dashboard/finances?tab=operations&search=${encodeURIComponent(String(row.title))}`);
          else navigate(`/dashboard/journal?date=${drilldown?.date ?? ''}`);
        }}
      />
    </>
  );
}
