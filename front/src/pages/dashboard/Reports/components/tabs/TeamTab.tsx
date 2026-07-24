import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { KpiStat } from '../shared/KpiStat';
import { InsightsPanel } from '../shared/InsightsPanel';
import { EmptyTabState } from '../shared/EmptyTabState';
import { isAllZero } from '../../hooks/useIsEmpty';
import { TrainersTable } from './team/TrainersTable';
import { TrainerDrawer } from './team/TrainerDrawer';
import type { ReportFiltersParams, TrainerRow } from '../../types';

export interface TeamTabProps {
  params: ReportFiltersParams;
  paramsKey: string;
  registerCsvExport: (rows: Record<string, unknown>[]) => void;
  onWidenPeriod: () => void;
}

export function TeamTab({ params, paramsKey, registerCsvExport, onWidenPeriod }: TeamTabProps) {
  const { t } = useTranslation('reports');
  const [selected, setSelected] = useState<TrainerRow | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.report('team', paramsKey),
    queryFn: () => analyticsApi.getTeam(params),
    placeholderData: prev => prev,
  });

  const kpi = data?.kpi;
  const trainers = data?.trainers ?? [];
  const isEmpty = !!data && isAllZero([], [data.trainers]);

  const csvRows = useMemo((): Record<string, unknown>[] => {
    return (data?.trainers ?? []).map(row => ({
      trainer: row.name,
      lessons: row.lessons,
      fill_pct: row.fill_pct,
      attendance: row.attendance,
      revenue: row.revenue,
      return_rate_pct: row.return_rate_pct,
      cancels: row.cancels,
      noshows: row.noshows,
      rating: row.rating ?? '',
    }));
  }, [data]);

  useEffect(() => {
    registerCsvExport(csvRows);
  }, [csvRows, registerCsvExport]);

  if (isEmpty) {
    return <EmptyTabState icon="clients" onWiden={onWidenPeriod} />;
  }

  return (
    <>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '20px' }}>
        <KpiStat
          label={t('team.kpi.lessonsCount')}
          value={kpi?.lessons_count.value ?? 0}
          trendPct={kpi?.lessons_count.prev_pct ?? null}
          formulaKey="lessonsCount"
          format="int"
        />
        <KpiStat
          label={t('team.kpi.revenuePerHour')}
          value={kpi?.revenue_per_hour.value ?? 0}
          trendPct={kpi?.revenue_per_hour.prev_pct ?? null}
          formulaKey="teamScope"
          format="money"
        />
        <KpiStat
          label={t('team.kpi.avgFillPct')}
          value={kpi?.avg_fill_pct.value ?? 0}
          trendPct={kpi?.avg_fill_pct.prev_pct ?? null}
          formulaKey="occupancy"
          format="pct"
        />
        <KpiStat
          label={t('team.kpi.cancelNoshowPct')}
          value={kpi?.cancel_noshow_pct.value ?? 0}
          trendPct={kpi?.cancel_noshow_pct.prev_pct ?? null}
          formulaKey="cancelNoshow"
          format="pct"
        />
        <KpiStat
          label={t('team.kpi.avgRating')}
          value={kpi?.avg_rating.value ?? 0}
          trendPct={kpi?.avg_rating.prev_pct ?? null}
          formulaKey="avgRating"
          format="decimal"
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <TrainersTable trainers={trainers} onRowClick={setSelected} />
      </div>

      <InsightsPanel insights={data?.insights ?? []} />

      {selected && (
        <TrainerDrawer
          trainer={selected}
          params={params}
          paramsKey={paramsKey}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
