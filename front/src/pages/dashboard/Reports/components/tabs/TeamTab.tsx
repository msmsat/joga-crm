import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { scheduleApi } from '../../../../../api/schedule';
import { queryKeys } from '../../../../../api/queryKeys';
import { fmtDateRange, fmtInt } from '../../../../../lib/format';
import { KpiStat } from '../shared/KpiStat';
import { InsightsPanel } from '../shared/InsightsPanel';
import { EmptyTabState } from '../shared/EmptyTabState';
import { DrilldownModal } from '../shared/DrilldownModal';
import type { DrilldownColumn } from '../shared/DrilldownModal';
import { isAllZero } from '../../hooks/useIsEmpty';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import { useScopeNote } from '../../hooks/useScopeNote';
import { TrainersTable, TRAINERS_TABLE_ID } from './team/TrainersTable';
import type { SortKey as TrainerSortKey } from './team/TrainersTable';
import { TrainerDrawer } from './team/TrainerDrawer';
import type { ReportFiltersParams, TrainerRow } from '../../types';

export interface TeamTabProps {
  params: ReportFiltersParams;
  paramsKey: string;
  registerCsvExport: (rows: Record<string, unknown>[]) => void;
  onWidenPeriod: () => void;
}

export function TeamTab({ params, paramsKey, registerCsvExport, onWidenPeriod }: TeamTabProps) {
  const { t, i18n } = useTranslation('reports');
  const navigate = useNavigate();
  const [selected, setSelected] = useState<TrainerRow | null>(null);
  const [trainerSortBy, setTrainerSortBy] = useState<TrainerSortKey | undefined>(undefined);
  const [trainerSortNonce, setTrainerSortNonce] = useState(0);
  const [showLessons, setShowLessons] = useState(false);
  const highlight = useHighlightRow();
  // Выручка Команды считается по op_conds: фильтры «Филиал» и «Зал» к платежам
  // неприменимы (матрица применимости R13) — денежные метрики это подписывают.
  const moneyScopeNote = useScopeNote('money');

  const { data } = useQuery({
    queryKey: queryKeys.report('team', paramsKey),
    queryFn: () => analyticsApi.getTeam(params),
    placeholderData: prev => prev,
  });

  const { data: periodLessons, isFetching: lessonsLoading } = useQuery({
    queryKey: queryKeys.journalLessons(params.date_from, params.date_to),
    queryFn: () => scheduleApi.getLessons({ date_from: params.date_from, date_to: params.date_to }),
    enabled: showLessons,
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

  // Задача 4 (EPIC R15): детализация этих KPI — сравнительная таблица под ними;
  // клик сортирует её по нужной колонке и скроллит к ней.
  const sortTable = (key: TrainerSortKey) => {
    setTrainerSortBy(key);
    setTrainerSortNonce(n => n + 1);
    highlight(TRAINERS_TABLE_ID);
  };

  const lessonColumns: DrilldownColumn[] = [
    { key: 'name', label: t('overview.drilldown.lesson') },
    { key: 'time', label: t('overview.drilldown.time') },
    { key: 'trainer', label: t('overview.drilldown.trainer') },
    { key: 'occupancy', label: t('overview.drilldown.occupancy'), align: 'right' },
  ];
  const lessonRows = (periodLessons ?? []).map(l => ({
    _id: l.id,
    _date: l.start_time.slice(0, 10),
    name: l.name,
    time: new Date(l.start_time).toLocaleString(i18n.language === 'en' ? 'en-US' : 'ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }),
    trainer: l.teacher_name ?? '—',
    occupancy: `${l.booked_count}/${l.total_spots}`,
  }));

  // Агрегаты левой панели — по сырым занятиям периода (в строках уже текст).
  const lessonSummary = useMemo(() => {
    const items = periodLessons ?? [];
    const spots = items.reduce((s, l) => s + l.total_spots, 0);
    const booked = items.reduce((s, l) => s + l.booked_count, 0);
    return {
      count: items.length,
      booked,
      spots,
      fillPct: spots ? Math.round((booked / spots) * 100) : 0,
      cancelled: items.filter(l => l.status === 'cancelled').length,
      trainers: new Set(items.map(l => l.teacher_id).filter(id => id != null)).size,
    };
  }, [periodLessons]);

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
          onClick={() => { sortTable('lessons'); setShowLessons(true); }}
        />
        <KpiStat
          label={t('team.kpi.revenuePerHour')}
          value={kpi?.revenue_per_hour.value ?? 0}
          trendPct={kpi?.revenue_per_hour.prev_pct ?? null}
          formulaKey="teamScope"
          format="money"
          scopeNote={moneyScopeNote}
          onClick={() => sortTable('revenue')}
        />
        <KpiStat
          label={t('team.kpi.avgFillPct')}
          value={kpi?.avg_fill_pct.value ?? 0}
          trendPct={kpi?.avg_fill_pct.prev_pct ?? null}
          formulaKey="occupancy"
          format="pct"
          onClick={() => sortTable('fill_pct')}
        />
        <KpiStat
          label={t('team.kpi.cancelNoshowPct')}
          value={kpi?.cancel_noshow_pct.value ?? 0}
          trendPct={kpi?.cancel_noshow_pct.prev_pct ?? null}
          formulaKey="cancelNoshow"
          format="pct"
          onClick={() => sortTable('cancels')}
        />
        {/* Осознанно без клика (EPIC R15): оценки анонимны (Reservation.rating),
        список раскрыл бы, кто как оценил. */}
        <KpiStat
          label={t('team.kpi.avgRating')}
          value={kpi?.avg_rating.value ?? 0}
          trendPct={kpi?.avg_rating.prev_pct ?? null}
          formulaKey="avgRating"
          format="decimal"
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <TrainersTable trainers={trainers} onRowClick={setSelected} sortBy={trainerSortBy} sortNonce={trainerSortNonce} />
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

      <DrilldownModal
        open={showLessons}
        onClose={() => setShowLessons(false)}
        title={`${t('team.kpi.lessonsCount')} · ${fmtDateRange(params.date_from, params.date_to)}`}
        subtitle={t('overview.drilldown.subtitle.lessons')}
        icon="calendar"
        hero={{ value: fmtInt(lessonSummary.count), label: t('overview.drilldown.stat.lessons') }}
        stats={[
          { label: t('overview.drilldown.stat.booked'), value: `${fmtInt(lessonSummary.booked)} / ${fmtInt(lessonSummary.spots)}` },
          { label: t('overview.drilldown.stat.avgFill'), value: `${lessonSummary.fillPct}%` },
          { label: t('overview.drilldown.stat.trainers'), value: fmtInt(lessonSummary.trainers) },
          { label: t('overview.drilldown.stat.cancelled'), value: fmtInt(lessonSummary.cancelled), tone: lessonSummary.cancelled ? 'negative' : undefined },
        ]}
        rowHint={t('overview.drilldown.hint.lessons')}
        exportName={`team-lessons-${params.date_from}_${params.date_to}`}
        columns={lessonColumns}
        rows={lessonRows}
        loading={lessonsLoading}
        onRowClick={row => navigate(`/dashboard/journal?date=${row._date}`)}
      />
    </>
  );
}
