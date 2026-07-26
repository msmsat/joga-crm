import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { analyticsApi, ApiError } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../components/UI';
import { fmtMoneyCompact, fmtInt } from '../../../../lib/format';
import type { MetricConfig, PeriodSummary } from '../types';
import { METRIC_PRESENTERS } from '../constants';

/** Сборщик метрик: валюта студии, без прочерков (0 по умолчанию), тренд — сырым числом. */
function buildMetrics(s: PeriodSummary | null, symbol: string): MetricConfig[] {
  const cell: Record<MetricConfig['id'], { value: string; changePct: number | null }> = {
    revenue:   { value: fmtMoneyCompact(s?.revenue ?? 0, symbol), changePct: s?.trends.revenue_pct        ?? null },
    clients:   { value: fmtInt(s?.active_clients ?? 0),           changePct: s?.trends.active_clients_pct ?? null },
    bookings:  { value: fmtInt(s?.bookings ?? 0),                 changePct: s?.trends.bookings_pct       ?? null },
    retention: { value: `${Math.round(s?.retention ?? 0)}%`,      changePct: s?.trends.retention_pct      ?? null },
  };
  return METRIC_PRESENTERS.map(p => ({ ...p, ...cell[p.id] }));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Диапазон текущего месяца [1-е число, сегодня] — для метрик и сводок. */
function monthRange(): { date_from: string; date_to: string } {
  const now = new Date();
  return {
    date_from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    date_to: iso(now),
  };
}

/** Метрики Обзора → метрика /series ('retention' ряда не имеет). */
const SERIES_METRIC: Record<MetricConfig['id'], 'revenue' | 'new_clients' | 'bookings' | null> = {
  revenue: 'revenue',
  clients: 'new_clients',
  bookings: 'bookings',
  retention: null,
};

/** period → сколько дней назад и группировка (у бэкенда только day/week/month). */
const SERIES_RANGE: Record<'week' | 'month' | 'year', { days: number; group: 'week' | 'month' }> = {
  week:  { days: 7 * 8,   group: 'week' },   // 8 недель
  month: { days: 30 * 8,  group: 'month' },  // 8 месяцев
  year:  { days: 365,     group: 'month' },  // 12 месяцев (группировки year нет)
};

export function useOverviewData() {
  // ── UI-состояние ──
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [activeMetric, setActiveMetric] = useState<MetricConfig['id']>('revenue');
  const currencySymbol = getCurrencySymbol(useStudioCurrency());

  // Диапазоны считаем один раз за рендер — они же входят в ключи кэша.
  const range = monthRange();
  const { days, group } = SERIES_RANGE[period];
  const seriesMetric = SERIES_METRIC[activeMetric]; // null для retention
  const now = new Date();
  const seriesFrom = iso(new Date(now.getTime() - days * 86_400_000));
  const seriesTo = iso(now);

  // ── Серверные данные ──
  const summary = useQuery({
    queryKey: queryKeys.overviewSummary(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getSummary(range),
  });

  const trainers = useQuery({
    queryKey: queryKeys.overviewTrainers(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getTrainers(range),
  });

  const services = useQuery({
    queryKey: queryKeys.overviewServices(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getServices(range),
  });

  const activity = useQuery({
    queryKey: queryKeys.overviewActivity,
    queryFn: () => analyticsApi.getActivityLog(13),
    refetchInterval: 60_000, // лента «живая» — как сетка Журнала
  });

  const series = useQuery({
    queryKey: queryKeys.overviewSeries(seriesMetric ?? 'none', group, seriesFrom, seriesTo),
    queryFn: () => analyticsApi.getSeries({ metric: seriesMetric!, group, date_from: seriesFrom, date_to: seriesTo }),
    enabled: seriesMetric !== null, // у retention ряда нет — запрос не шлём
    placeholderData: keepPreviousData, // смена метрики/периода не гасит график
  });

  // ── Производные ──
  const queries = [summary, trainers, services, activity];
  const forbidden = queries.some(q => q.error instanceof ApiError && q.error.status === 403);
  const loading = queries.some(q => q.isPending) && !forbidden;

  const metrics: MetricConfig[] = useMemo(
    () => buildMetrics(summary.data ?? null, currencySymbol),
    [summary.data, currencySymbol],
  );

  const activeConfig = metrics.find(m => m.id === activeMetric)!;

  return {
    loading, forbidden,
    summary: summary.data ?? null,
    metrics, activeMetric, setActiveMetric, activeConfig,
    period, setPeriod, series: series.data ?? [],
    trainers: trainers.data ?? [], services: services.data ?? [],
    events: activity.data ?? [],
    currencySymbol,
    // tasks/setTasks здесь БОЛЬШЕ НЕТ — вынесены в useOverviewTasks.ts (временная заглушка до D4)
  };
}
