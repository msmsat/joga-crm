import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { KpiStat } from '../shared/KpiStat';
import { InsightsPanel } from '../shared/InsightsPanel';
import { DrilldownModal } from '../shared/DrilldownModal';
import type { DrilldownColumn } from '../shared/DrilldownModal';
import { EmptyTabState } from '../shared/EmptyTabState';
import { isAllZero } from '../../hooks/useIsEmpty';
import { Heatmap } from './schedule/Heatmap';
import { SlicesCards } from './schedule/SlicesCards';
import type { ReportFiltersParams } from '../../types';

export interface ScheduleTabProps {
  params: ReportFiltersParams;
  paramsKey: string;
  registerCsvExport: (rows: Record<string, unknown>[]) => void;
  onWidenPeriod: () => void;
}

export function ScheduleTab({ params, paramsKey, registerCsvExport, onWidenPeriod }: ScheduleTabProps) {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();
  const [slot, setSlot] = useState<{ weekday: number; hour: number } | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.report('schedule', paramsKey),
    queryFn: () => analyticsApi.getUtilization(params),
    placeholderData: prev => prev,
  });
  const isEmpty = !!data && isAllZero([], [data.heatmap]);

  const { data: slotLessons, isFetching: slotLoading } = useQuery({
    queryKey: queryKeys.report('schedule-slot', slot ? `${slot.weekday}-${slot.hour}-${paramsKey}` : 'none'),
    queryFn: () => analyticsApi.getUtilizationSlot(slot!.weekday, slot!.hour, params),
    enabled: !!slot,
  });

  const kpi = data?.kpi;
  const weekdayLabels = t('schedule.weekdaysMonFirst', { returnObjects: true }) as string[];

  const csvRows = useMemo((): Record<string, unknown>[] => {
    const heatmapRows = (data?.heatmap ?? []).map(c => ({
      weekday: c.weekday, hour: c.hour, lessons: c.lessons, fill_pct: c.fill_pct,
    }));
    const chronicRows = (data?.chronic_low ?? []).map(r => ({
      weekday: r.weekday, hour: r.hour, lessons: r.weeks, fill_pct: r.fill_pct, name: r.name,
    }));
    return [...heatmapRows, ...chronicRows];
  }, [data]);

  useEffect(() => {
    registerCsvExport(csvRows);
  }, [csvRows, registerCsvExport]);

  const drilldownColumns: DrilldownColumn[] = [
    { key: 'date', label: t('schedule.drilldown.date') },
    { key: 'name', label: t('schedule.drilldown.lesson') },
    { key: 'teacher', label: t('schedule.drilldown.teacher') },
    { key: 'hall', label: t('schedule.drilldown.hall') },
    { key: 'occupancy', label: t('schedule.drilldown.occupancy') },
    { key: 'status', label: t('schedule.drilldown.status') },
  ];
  const drilldownRows = (slotLessons ?? []).map(row => ({
    id: row.id,
    date: row.date,
    name: row.name,
    teacher: row.teacher_name,
    hall: row.hall ?? '—',
    occupancy: `${row.occupied}/${row.total_spots}`,
    status: t(`schedule.status.${row.status}`, row.status),
  }));

  if (isEmpty) {
    return <EmptyTabState icon="calendar" onWiden={onWidenPeriod} />;
  }

  return (
    <>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '20px' }}>
        <KpiStat
          label={t('schedule.kpi.avgFillPct')}
          value={kpi?.avg_fill_pct.value ?? 0}
          trendPct={kpi?.avg_fill_pct.prev_pct ?? null}
          formulaKey="occupancy"
          format="pct"
        />
        <KpiStat
          label={t('schedule.kpi.freeSpots')}
          value={kpi?.free_spots.value ?? 0}
          trendPct={kpi?.free_spots.prev_pct ?? null}
          formulaKey="occupancy"
          format="int"
        />
        <KpiStat
          label={t('schedule.kpi.cancels')}
          value={kpi?.cancels.value ?? 0}
          trendPct={kpi?.cancels.prev_pct ?? null}
          formulaKey="bookings"
          format="int"
        />
        <KpiStat
          label={t('schedule.kpi.noshows')}
          value={kpi?.noshows.value ?? 0}
          trendPct={kpi?.noshows.prev_pct ?? null}
          formulaKey="noshow"
          format="int"
        />
        <KpiStat
          label={t('schedule.kpi.lostRevenue')}
          value={kpi?.lost_revenue.value ?? 0}
          trendPct={kpi?.lost_revenue.prev_pct ?? null}
          formulaKey="missedRevenue"
          format="money"
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <Heatmap cells={data?.heatmap ?? []} onCellClick={(weekday, hour) => setSlot({ weekday, hour })} />
      </div>

      <SlicesCards
        topProfitable={data?.top_profitable ?? []}
        topFilled={data?.top_filled ?? []}
        chronicLow={data?.chronic_low ?? []}
        halls={data?.halls ?? []}
      />

      <InsightsPanel insights={data?.insights ?? []} />

      <DrilldownModal
        open={!!slot}
        onClose={() => setSlot(null)}
        title={slot ? `${weekdayLabels[slot.weekday - 1]} ${slot.hour}:00` : ''}
        columns={drilldownColumns}
        rows={drilldownRows}
        loading={slotLoading}
        onRowClick={(row) => navigate(`/dashboard/journal?lesson_id=${row.id}`)}
      />
    </>
  );
}
