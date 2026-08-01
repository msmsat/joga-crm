import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, LabelList, XAxis, YAxis, Legend } from 'recharts';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { fmtInt, fmtDateRange } from '../../../../../lib/format';
import { useToast } from '../../../../../components/ui/index';
import { KpiStat } from '../shared/KpiStat';
import { ChartCard } from '../shared/ChartCard';
import { ChartFrame } from '../shared/ChartFrame';
import { AXIS_X, BAR_CURSOR, PEACH_LIGHT, BLUE } from '../shared/chartTheme';
import { ChartTooltip } from '../shared/ChartTooltip';
import { ZeroLabel } from '../shared/ZeroLabel';
import { zeroAwareCells } from '../shared/zeroAwareCells';
import { MainWithInsights } from '../shared/MainWithInsights';
import { ClientListModal } from '../shared/ClientListModal';
import { EmptyTabState } from '../shared/EmptyTabState';
import { isAllZero } from '../../hooks/useIsEmpty';
import { useScopeNote } from '../../hooks/useScopeNote';
import { SegmentCards } from './clients/SegmentCards';
import type { ReportFiltersParams, SegmentClientRow } from '../../types';

export interface ClientsTabProps {
  params: ReportFiltersParams;
  paramsKey: string;
  registerCsvExport: (rows: Record<string, unknown>[]) => void;
  onWidenPeriod: () => void;
}

type Drilldown =
  | { kind: 'segment'; key: string; title: string }
  | { kind: 'week'; period: string; weekKind: 'new' | 'returned'; title: string };

// Совпадает с PERIOD_SEGMENT_KEYS в back/routers/analytics/retention.py.
const PERIOD_SEGMENT_KEYS = ['new', 'returned', 'lost'];

function fmtWeek(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export function ClientsTab({ params, paramsKey, registerCsvExport, onWidenPeriod }: ClientsTabProps) {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();
  const { info } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // new/returned/lost скоуплены выбранным периодом отчёта (в отличие от
  // риск/лояльных сегментов) — заголовок обязан назвать этот период.
  const segmentTitle = (key: string): string => {
    const name = t(`clients.segments.${key}.name`);
    return PERIOD_SEGMENT_KEYS.includes(key) ? `${name} · ${fmtDateRange(params.date_from, params.date_to)}` : name;
  };
  // Прямая ссылка на вкладку (?tab=clients&segment=active) должна открыть drilldown
  // немедленно — segment из URL как источник истины важнее локального клика.
  const urlSegment = searchParams.get('segment');
  const [clickDrilldown, setDrilldown] = useState<Drilldown | null>(null);
  const drilldown: Drilldown | null = urlSegment
    ? { kind: 'segment', key: urlSegment, title: segmentTitle(urlSegment) }
    : clickDrilldown;
  const lastEmptyToastRef = useRef<{ key: string; at: number } | null>(null);
  const clientBaseScopeNote = useScopeNote('clientBase');
  const moneyScopeNote = useScopeNote('money');

  const { data } = useQuery({
    queryKey: queryKeys.report('clients', paramsKey),
    queryFn: () => analyticsApi.getClientsReport(params),
    placeholderData: prev => prev,
  });

  const chartData = useMemo(
    () => (data?.weekly ?? []).map(w => ({ period: w.period, label: fmtWeek(w.period), new: w.new, returned: w.returned })),
    [data],
  );

  const segmentKey = drilldown?.kind === 'segment' ? drilldown.key : null;
  const { data: segmentRows, isFetching: segmentLoading } = useQuery({
    queryKey: queryKeys.report('clients-segment', `${segmentKey ?? 'none'}-${paramsKey}`),
    queryFn: () => analyticsApi.getClientsReportSegment(segmentKey as string, params),
    enabled: !!segmentKey,
  });

  const weekDrilldown = drilldown?.kind === 'week' ? drilldown : null;
  const { data: weekRows, isFetching: weekLoading } = useQuery({
    queryKey: queryKeys.report('clients-week', weekDrilldown ? `${weekDrilldown.period}-${weekDrilldown.weekKind}-${paramsKey}` : 'none'),
    queryFn: () => analyticsApi.getClientsReportWeek(weekDrilldown!.period, weekDrilldown!.weekKind, params),
    enabled: !!weekDrilldown,
  });

  const drilldownRows: SegmentClientRow[] = drilldown?.kind === 'segment' ? (segmentRows ?? []) : (weekRows ?? []);
  const drilldownLoading = drilldown?.kind === 'segment' ? segmentLoading : weekLoading;

  // Сегмент, открытый по ссылке, может оказаться пустым (счётчик KPI устарел) —
  // закрываем модалку тостом вместо пустой таблицы и вычищаем segment из URL
  // (drilldown сам схлопнется в null, как только urlSegment пропадёт).
  useEffect(() => {
    if (!urlSegment || segmentLoading || !segmentRows || segmentRows.length > 0) return;
    info(t('clients.emptySegment', { name: t(`clients.segments.${urlSegment}.name`) }));
    setSearchParams(prev => {
      if (!prev.get('segment')) return prev;
      const next = new URLSearchParams(prev);
      next.delete('segment');
      return next;
    }, { replace: true });
  }, [urlSegment, segmentLoading, segmentRows, info, t, setSearchParams]);

  const kpi = data?.kpi;
  const isEmpty = !!data && isAllZero(
    [
      data.kpi.new.value, data.kpi.returned.value, data.kpi.lost.value,
      ...data.risk_segments.map(s => s.count), ...data.loyal_segments.map(s => s.count),
    ],
    [],
  );

  const csvRows = useMemo((): Record<string, unknown>[] => {
    if (!data) return [];
    return [
      { metric: 'new', value: data.kpi.new.value, prev_pct: data.kpi.new.prev_pct ?? '' },
      { metric: 'returned', value: data.kpi.returned.value, prev_pct: data.kpi.returned.prev_pct ?? '' },
      { metric: 'lost', value: data.kpi.lost.value, prev_pct: data.kpi.lost.prev_pct ?? '' },
      { metric: 'retention_pct', value: data.kpi.retention_pct.value, prev_pct: data.kpi.retention_pct.prev_pct ?? '' },
      { metric: 'avg_value', value: data.kpi.avg_value.value, prev_pct: data.kpi.avg_value.prev_pct ?? '' },
      ...data.risk_segments.map(s => ({ metric: `risk_segment:${s.key}`, value: s.count, prev_pct: '' })),
      ...data.loyal_segments.map(s => ({ metric: `loyal_segment:${s.key}`, value: s.count, prev_pct: '' })),
    ];
  }, [data]);

  useEffect(() => {
    registerCsvExport(csvRows);
  }, [csvRows, registerCsvExport]);

  // Задача 2 (EPIC R15): точка графика знает свой вид клиентов только через
  // dataKey самого <Bar> — onClick на <BarChart> его не получает.
  const openWeek = (point: (typeof chartData)[number], kind: 'new' | 'returned') => {
    if (!point[kind]) return; // нулевой столбец — не данные, не открываем пустую модалку
    const metricLabel = kind === 'new' ? t('clients.chart.new') : t('clients.chart.returned');
    setDrilldown({ kind: 'week', period: point.period, weekKind: kind, title: `${metricLabel} · ${fmtWeek(point.period)}` });
  };

  const segmentCount = (key: string) => {
    if (key === 'new') return data?.kpi.new.value ?? 0;
    if (key === 'returned') return data?.kpi.returned.value ?? 0;
    if (key === 'lost') return data?.kpi.lost.value ?? 0;
    return [...(data?.risk_segments ?? []), ...(data?.loyal_segments ?? [])].find(s => s.key === key)?.count ?? 0;
  };

  const openSegment = (key: string) => {
    if (!segmentCount(key)) {
      // Дедуп повторного клика по тому же пустому сегменту — useToast не дедупит сам.
      const now = Date.now();
      const last = lastEmptyToastRef.current;
      if (last?.key === key && now - last.at < 2000) return;
      lastEmptyToastRef.current = { key, at: now };
      info(t('clients.emptySegment', { name: t(`clients.segments.${key}.name`) }));
      return;
    }
    setDrilldown({ kind: 'segment', key, title: segmentTitle(key) });
  };

  const openCampaign = (key: string) => {
    navigate(`/dashboard/loyalty?segment=${encodeURIComponent(key)}`);
  };

  // Смысл SegmentClientRow.value зависит от сегмента (back/routers/analytics/retention.py:_match_value) —
  // подпись подбирается по той же группировке, иначе число без единиц измерения ничего не значит.
  const VALUE_LABEL_BY_SEGMENT: Record<string, string> = {
    active: 'visits', frequent: 'visits', new: 'visits', returned: 'visits',
    high_ltv: 'spent',
    at_risk: 'daysIdle', vip_idle: 'daysIdle', lost_newcomers: 'daysIdle', lost: 'daysIdle',
    expiring_subscription: 'remaining',
  };
  const valueLabel = t(`clients.valueLabel.${
    drilldown?.kind === 'segment' ? (VALUE_LABEL_BY_SEGMENT[drilldown.key] ?? 'value') : 'value'
  }`);

  // "Пусто" считается по new/returned/lost и сегментам риска/лояльности — сегмент
  // 'active' в этот подсчёт не входит, поэтому при явной ссылке ?segment=active
  // не прячем вкладку за EmptyTabState, пока drilldown не решит, что показывать.
  if (isEmpty && !urlSegment) {
    return <EmptyTabState icon="clients" onWiden={onWidenPeriod} />;
  }

  return (
    <>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '20px' }}>
        <KpiStat
          label={t('clients.kpi.new')}
          value={kpi?.new.value ?? 0}
          trendPct={kpi?.new.prev_pct ?? null}
          formulaKey="newClients"
          format="int"
          scopeNote={clientBaseScopeNote}
          onClick={() => openSegment('new')}
        />
        <KpiStat
          label={t('clients.kpi.returned')}
          value={kpi?.returned.value ?? 0}
          trendPct={kpi?.returned.prev_pct ?? null}
          formulaKey="returning"
          format="int"
          onClick={() => openSegment('returned')}
        />
        <KpiStat
          label={t('clients.kpi.lost')}
          value={kpi?.lost.value ?? 0}
          trendPct={kpi?.lost.prev_pct ?? null}
          formulaKey="lost"
          format="int"
          onClick={() => openSegment('lost')}
        />
        {/* Осознанно без клика (EPIC R15): доля, а не множество — «54%» не
        разворачивается в список без произвольного выбора числителя. */}
        <KpiStat
          label={t('clients.kpi.retention')}
          value={kpi?.retention_pct.value ?? 0}
          trendPct={kpi?.retention_pct.prev_pct ?? null}
          formulaKey="retention"
          format="pct"
        />
        {/* Осознанно без клика (EPIC R15): средняя по выручке; детализация —
        вкладка Продажи, уводить туда с Клиентов вредно. */}
        <KpiStat
          label={t('clients.kpi.avgValue')}
          value={kpi?.avg_value.value ?? 0}
          trendPct={kpi?.avg_value.prev_pct ?? null}
          formulaKey="avgValue"
          format="money"
          scopeNote={moneyScopeNote}
        />
      </div>

      <MainWithInsights insights={data?.insights ?? []}>
        <ChartCard title={t('clients.chart.title')} description={t('descriptions.clients.chart')} formulaKey="weeklyClients">
          <ChartFrame>
            <BarChart data={chartData}>
              <XAxis dataKey="label" {...AXIS_X} />
              <YAxis hide />
              <ChartTooltip formatter={(v) => fmtInt(Number(v))} cursor={BAR_CURSOR} />
              <Legend
                formatter={(value) => (value === 'new' ? t('clients.chart.new') : t('clients.chart.returned'))}
                wrapperStyle={{ fontSize: '12px' }}
              />
              <Bar dataKey="new" fill={PEACH_LIGHT} radius={[6, 6, 0, 0]} maxBarSize={20} minPointSize={3} cursor="pointer" activeBar={false}
                onClick={(_, i) => openWeek(chartData[i], 'new')}>
                <LabelList dataKey="new" position="top" content={ZeroLabel} />
                {zeroAwareCells(chartData, 'new', PEACH_LIGHT)}
              </Bar>
              <Bar dataKey="returned" fill={BLUE} radius={[6, 6, 0, 0]} maxBarSize={20} minPointSize={3} cursor="pointer" activeBar={false}
                onClick={(_, i) => openWeek(chartData[i], 'returned')}>
                <LabelList dataKey="returned" position="top" content={ZeroLabel} />
                {zeroAwareCells(chartData, 'returned', BLUE)}
              </Bar>
            </BarChart>
          </ChartFrame>
        </ChartCard>
      </MainWithInsights>

      <SegmentCards
        riskSegments={data?.risk_segments ?? []}
        loyalSegments={data?.loyal_segments ?? []}
        onList={openSegment}
        onCampaign={openCampaign}
      />

      <ClientListModal
        open={!!drilldown}
        onClose={() => {
          setDrilldown(null);
          if (urlSegment) {
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('segment');
              return next;
            }, { replace: true });
          }
        }}
        title={drilldown?.title ?? ''}
        subtitle={drilldown?.kind === 'segment' ? t(`clients.segments.${drilldown.key}.desc`) : undefined}
        rows={drilldownRows}
        valueLabel={valueLabel}
        loading={drilldownLoading}
        onCampaign={drilldown?.kind === 'segment' ? () => openCampaign(drilldown.key) : undefined}
      />
    </>
  );
}
