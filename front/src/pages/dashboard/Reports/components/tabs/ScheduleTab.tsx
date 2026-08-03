import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { fmtBucket } from '../../../../../lib/format';
import { KpiStat } from '../shared/KpiStat';
import { InsightsPanel } from '../shared/InsightsPanel';
import { EmptyTabState } from '../shared/EmptyTabState';
import { isAllZero } from '../../hooks/useIsEmpty';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import { Heatmap } from './schedule/Heatmap';
import { LossSlices, LOSS_SLICES_ID } from './schedule/LossSlices';
import type { LossDim, LossMetric } from './schedule/LossSlices';
import { SlicesCards, CHRONIC_LOW_ID } from './schedule/SlicesCards';
import { SlotModal } from './schedule/SlotModal';
import type { ReportFiltersParams } from '../../types';

const REPORTS_HEATMAP_ID = 'reports-heatmap';

export interface ScheduleTabProps {
  params: ReportFiltersParams;
  paramsKey: string;
  registerCsvExport: (rows: Record<string, unknown>[]) => void;
  onWidenPeriod: () => void;
  onFilterChange: (key: 'branchId' | 'hallId' | 'trainerId' | 'serviceId', value: number | null) => void;
}

export function ScheduleTab({ params, paramsKey, registerCsvExport, onWidenPeriod, onFilterChange }: ScheduleTabProps) {
  const { t } = useTranslation('reports');
  const [slot, setSlot] = useState<{ weekday: number; hour: number } | null>(null);
  const [lossFocusDim, setLossFocusDim] = useState<LossDim | undefined>(undefined);
  const [lossFocusMetric, setLossFocusMetric] = useState<LossMetric | undefined>(undefined);
  const highlightRow = useHighlightRow();
  const activeTrainerId = params.trainer_id ?? null;
  const activeServiceId = params.service_id ?? null;

  // Задача 5 (EPIC R15): «Отмены»/«No-show» ведут в один и тот же блок
  // «Отмены и неявки» — разрез «По времени» и выделение своей цифры цветом.
  const focusLosses = (metric: LossMetric) => {
    setLossFocusDim('hour');
    setLossFocusMetric(metric);
    highlightRow(LOSS_SLICES_ID);
  };

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
    const lossRows = (['by_hour', 'by_service', 'by_trainer'] as const).flatMap(dim =>
      (data?.losses[dim] ?? []).map(r => ({
        dim, label: r.label, cancels: r.cancels, noshows: r.noshows, lost_spots: r.lost_spots,
      })),
    );
    return [...heatmapRows, ...chronicRows, ...lossRows];
  }, [data]);

  useEffect(() => {
    registerCsvExport(csvRows);
  }, [csvRows, registerCsvExport]);

  if (isEmpty) {
    return <EmptyTabState icon="calendar" onWiden={onWidenPeriod} />;
  }

  return (
    <>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', marginBottom: '20px' }}>
        <KpiStat
          label={t('schedule.kpi.avgFillPct')}
          value={kpi?.avg_fill_pct.value ?? 0}
          trendPct={kpi?.avg_fill_pct.prev_pct ?? null}
          formulaKey="occupancy"
          format="pct"
          onClick={() => highlightRow(REPORTS_HEATMAP_ID)}
        />
        {/* Осознанно без клика (EPIC R15): разворот = «все прошедшие занятия
        с местами» — это ровно chronic_low + тепловая карта, уже на экране. */}
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
          onClick={() => focusLosses('cancels')}
        />
        <KpiStat
          label={t('schedule.kpi.noshows')}
          value={kpi?.noshows.value ?? 0}
          trendPct={kpi?.noshows.prev_pct ?? null}
          formulaKey="noshow"
          format="int"
          onClick={() => focusLosses('noshows')}
        />
        <KpiStat
          label={t('schedule.kpi.lostRevenue')}
          value={kpi?.lost_revenue.value ?? 0}
          trendPct={kpi?.lost_revenue.prev_pct ?? null}
          formulaKey="missedRevenue"
          format="money"
          onClick={() => highlightRow(CHRONIC_LOW_ID)}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <Heatmap cells={data?.heatmap ?? []} onCellClick={(weekday, hour) => setSlot({ weekday, hour })} />
      </div>

      <LossSlices
        byHour={data?.losses.by_hour ?? []}
        byService={data?.losses.by_service ?? []}
        byTrainer={data?.losses.by_trainer ?? []}
        activeTrainerId={activeTrainerId}
        activeServiceId={activeServiceId}
        onHourClick={hour => highlightRow(REPORTS_HEATMAP_ID, `heatmap-row-${hour}`)}
        onTrainerClick={trainerId => onFilterChange('trainerId', trainerId === activeTrainerId ? null : trainerId)}
        onServiceClick={serviceId => onFilterChange('serviceId', serviceId === activeServiceId ? null : serviceId)}
        focusDim={lossFocusDim}
        focusMetric={lossFocusMetric}
      />

      <SlicesCards
        topProfitable={data?.top_profitable ?? []}
        topFilled={data?.top_filled ?? []}
        chronicLow={data?.chronic_low ?? []}
        halls={data?.halls ?? []}
      />

      <InsightsPanel insights={data?.insights ?? []} />

      <SlotModal
        open={!!slot}
        onClose={() => setSlot(null)}
        title={slot ? `${weekdayLabels[slot.weekday - 1]} ${slot.hour}:00` : ''}
        subtitle={t('schedule.slot.summary', { from: fmtBucket(params.date_from, 'day'), to: fmtBucket(params.date_to, 'day') })}
        rows={slotLessons ?? []}
        loading={slotLoading}
      />
    </>
  );
}
