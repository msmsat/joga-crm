import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { analyticsApi, ApiError } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../components/UI';
import { fmtMoneyCompact, fmtInt } from '../../../../lib/format';
import type { MetricConfig, PeriodSummary } from '../types';
import { METRIC_PRESENTERS } from '../constants';

/** Сборщик метрик: валюта студии, без прочерков (0 по умолчанию), тренд — сырым числом. */
function buildMetrics(s: PeriodSummary | null, symbol: string, t: TFunction): MetricConfig[] {
  const cell: Record<MetricConfig['id'], { value: string; changePct: number | null }> = {
    revenue:   { value: fmtMoneyCompact(s?.revenue ?? 0, symbol), changePct: s?.trends.revenue_pct        ?? null },
    clients:   { value: fmtInt(s?.active_clients ?? 0),           changePct: s?.trends.active_clients_pct ?? null },
    bookings:  { value: fmtInt(s?.bookings ?? 0),                 changePct: s?.trends.bookings_pct       ?? null },
    retention: { value: `${Math.round(s?.retention ?? 0)}%`,      changePct: s?.trends.retention_pct      ?? null },
  };
  return METRIC_PRESENTERS.map(p => ({ ...p, ...cell[p.id], title: t(`metrics.${p.id}`) }));
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
function seriesRange(now: Date): Record<'week' | 'month' | 'year', { days: number; group: 'day' | 'month' }> {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    week:  { days: 7,          group: 'day' },   // 7 дней текущей недели
    month: { days: daysInMonth, group: 'day' },  // дни текущего месяца
    year:  { days: 365,         group: 'month' }, // 12 месяцев (группировки year нет)
  };
}

// Сводки за месяц не меняются посекундно: в пределах 5 минут возврат на Дашборд
// отдаёт кэш мгновенно и без фонового перезапроса (иначе дефолтные 30с из
// queryClient дёргали бы все 5 эндпоинтов при каждом входе и фокусе окна).
const STALE = 5 * 60_000;

export function useOverviewData() {
  const { t } = useTranslation('dashboard');
  // ── UI-состояние ──
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [activeMetric, setActiveMetric] = useState<MetricConfig['id']>('revenue');
  const currencySymbol = getCurrencySymbol(useStudioCurrency());

  // Диапазоны считаем один раз за рендер — они же входят в ключи кэша.
  const range = monthRange();
  const now = new Date();
  const { days, group } = seriesRange(now)[period];
  const seriesMetric = SERIES_METRIC[activeMetric]; // null для retention
  const seriesFrom = iso(new Date(now.getTime() - days * 86_400_000));
  const seriesTo = iso(now);

  // ── Серверные данные ──
  const summary = useQuery({
    queryKey: queryKeys.overviewSummary(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getSummary(range),
    staleTime: STALE,
  });

  const trainers = useQuery({
    queryKey: queryKeys.overviewTrainers(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getTrainers(range),
    staleTime: STALE,
  });

  const services = useQuery({
    queryKey: queryKeys.overviewServices(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getServices(range),
    staleTime: STALE,
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
    staleTime: STALE,
  });

  // ── Производные ──
  // Общего «Загрузка данных…» на всю страницу больше нет: каркас рисуется сразу,
  // каждый блок ждёт только свой запрос. Иначе метрики (уже пришедшие) не видно,
  // пока грузятся тренеры/услуги/лента — а они вообще ниже первого экрана.
  const queries = [summary, trainers, services, activity];
  const forbidden = queries.some(q => q.error instanceof ApiError && q.error.status === 403);

  // Первая загрузка «с нуля» (кэша ни у одного из четырёх запросов ещё нет) vs
  // фоновая: forbidden — это «нет доступа», не ошибка сети, из loadError исключён.
  const isFirstLoad = queries.some(q => q.isPending) && !forbidden;
  const loadError = forbidden ? null : (queries.find(q => q.error)?.error ?? null);
  const isFirstLoadError = isFirstLoad && loadError != null;
  const refetchAll = () => { summary.refetch(); trainers.refetch(); services.refetch(); activity.refetch(); };

  const metrics: MetricConfig[] = useMemo(
    () => buildMetrics(summary.data ?? null, currencySymbol, t),
    [summary.data, currencySymbol, t],
  );

  const activeConfig = metrics.find(m => m.id === activeMetric)!;

  return {
    forbidden,
    isFirstLoadError, loadError, refetchAll,
    summaryLoading: summary.isPending && !forbidden,
    widgetsLoading: (trainers.isPending || services.isPending) && !forbidden,
    summary: summary.data ?? null,
    metrics, activeMetric, setActiveMetric, activeConfig,
    period, setPeriod, series: series.data ?? [],
    trainers: trainers.data ?? [], services: services.data ?? [],
    events: activity.data ?? [],
    currencySymbol,
    // tasks/setTasks здесь БОЛЬШЕ НЕТ — вынесены в useOverviewTasks.ts (временная заглушка до D4)
  };
}
