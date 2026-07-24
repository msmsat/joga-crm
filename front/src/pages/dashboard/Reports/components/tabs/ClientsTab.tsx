import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, LabelList, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { CategoricalChartFunc } from 'recharts/types/chart/types';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { fmtInt } from '../../../../../lib/format';
import { GhostButton, useToast } from '../../../../../components/ui/index';
import { KpiStat } from '../shared/KpiStat';
import { ChartCard } from '../shared/ChartCard';
import { ChartFrame } from '../shared/ChartFrame';
import { AXIS_X, TOOLTIP_STYLE, BAR_CURSOR, PEACH_LIGHT, BLUE } from '../shared/chartTheme';
import { ZeroLabel } from '../shared/ZeroLabel';
import { zeroAwareCells } from '../shared/zeroAwareCells';
import { InsightsPanel } from '../shared/InsightsPanel';
import { DrilldownModal } from '../shared/DrilldownModal';
import type { DrilldownColumn } from '../shared/DrilldownModal';
import { EmptyTabState } from '../shared/EmptyTabState';
import { isAllZero } from '../../hooks/useIsEmpty';
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

function fmtWeek(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export function ClientsTab({ params, paramsKey, registerCsvExport, onWidenPeriod }: ClientsTabProps) {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();
  const { info } = useToast();
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const lastEmptyToastRef = useRef<{ key: string; at: number } | null>(null);

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
    queryKey: queryKeys.report('clients-week', weekDrilldown ? `${weekDrilldown.period}-${weekDrilldown.weekKind}` : 'none'),
    queryFn: () => analyticsApi.getClientsReportWeek(weekDrilldown!.period, weekDrilldown!.weekKind),
    enabled: !!weekDrilldown,
  });

  const drilldownRows: SegmentClientRow[] = drilldown?.kind === 'segment' ? (segmentRows ?? []) : (weekRows ?? []);
  const drilldownLoading = drilldown?.kind === 'segment' ? segmentLoading : weekLoading;

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

  const handleChartClick: CategoricalChartFunc = (nextState) => {
    const idx = nextState.activeTooltipIndex;
    if (typeof idx !== 'number' || !chartData[idx] || !chartData[idx].new) return;
    const period = chartData[idx].period;
    setDrilldown({ kind: 'week', period, weekKind: 'new', title: fmtWeek(period) });
  };

  const segmentCount = (key: string) =>
    [...(data?.risk_segments ?? []), ...(data?.loyal_segments ?? [])].find(s => s.key === key)?.count ?? 0;

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
    setDrilldown({ kind: 'segment', key, title: t(`clients.segments.${key}.name`) });
  };

  const openCampaign = (key: string) => {
    navigate(`/dashboard/loyalty?segment=${encodeURIComponent(key)}`);
  };

  const drilldownColumns: DrilldownColumn[] = [
    { key: 'name', label: t('clients.drilldown.name') },
    { key: 'phone', label: t('clients.drilldown.phone') },
    { key: 'lastVisit', label: t('clients.drilldown.lastVisit') },
    { key: 'value', label: t('clients.drilldown.value') },
  ];
  const drilldownTableRows = drilldownRows.map(row => ({
    id: row.id,
    name: [row.name, row.last_name].filter(Boolean).join(' '),
    phone: row.phone ?? '—',
    lastVisit: row.last_visit_date ?? '—',
    value: row.value != null ? fmtInt(row.value) : '—',
  }));

  const exportDrilldownList = () => {
    const rows = drilldownTableRows.map(({ name, phone, lastVisit, value }) => ({ name, phone, lastVisit, value }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]).join(',');
    const body = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + headers + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-${drilldown?.kind === 'segment' ? drilldown.key : 'week'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isEmpty) {
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
        />
        <KpiStat
          label={t('clients.kpi.returned')}
          value={kpi?.returned.value ?? 0}
          trendPct={kpi?.returned.prev_pct ?? null}
          formulaKey="returning"
          format="int"
        />
        <KpiStat
          label={t('clients.kpi.lost')}
          value={kpi?.lost.value ?? 0}
          trendPct={kpi?.lost.prev_pct ?? null}
          formulaKey="lost"
          format="int"
        />
        <KpiStat
          label={t('clients.kpi.retention')}
          value={kpi?.retention_pct.value ?? 0}
          trendPct={kpi?.retention_pct.prev_pct ?? null}
          formulaKey="retention"
          format="pct"
        />
        <KpiStat
          label={t('clients.kpi.avgValue')}
          value={kpi?.avg_value.value ?? 0}
          trendPct={kpi?.avg_value.prev_pct ?? null}
          formulaKey="avgValue"
          format="money"
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <ChartCard title={t('clients.chart.title')} formulaKey="newClients">
          <ChartFrame>
            <BarChart data={chartData} onClick={handleChartClick}>
              <XAxis dataKey="label" {...AXIS_X} />
              <YAxis hide />
              <Tooltip formatter={(v) => fmtInt(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
              <Legend
                formatter={(value) => (value === 'new' ? t('clients.chart.new') : t('clients.chart.returned'))}
                wrapperStyle={{ fontSize: '12px' }}
              />
              <Bar dataKey="new" fill={PEACH_LIGHT} radius={[6, 6, 0, 0]} maxBarSize={20} minPointSize={3} cursor="pointer" activeBar={false}>
                <LabelList dataKey="new" position="top" content={ZeroLabel} />
                {zeroAwareCells(chartData, 'new', PEACH_LIGHT)}
              </Bar>
              <Bar dataKey="returned" fill={BLUE} radius={[6, 6, 0, 0]} maxBarSize={20} minPointSize={3} cursor="pointer" activeBar={false}>
                <LabelList dataKey="returned" position="top" content={ZeroLabel} />
                {zeroAwareCells(chartData, 'returned', BLUE)}
              </Bar>
            </BarChart>
          </ChartFrame>
        </ChartCard>
      </div>

      <SegmentCards
        riskSegments={data?.risk_segments ?? []}
        loyalSegments={data?.loyal_segments ?? []}
        onList={openSegment}
        onCampaign={openCampaign}
      />

      <InsightsPanel insights={data?.insights ?? []} />

      <DrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        columns={drilldownColumns}
        rows={drilldownTableRows}
        loading={drilldownLoading}
        onRowClick={(row) => navigate(`/dashboard/clients?client=${row.id}`)}
        footer={drilldownTableRows.length > 0 && (
          <GhostButton onClick={exportDrilldownList}>{t('clients.exportList')}</GhostButton>
        )}
      />
    </>
  );
}
