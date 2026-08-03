import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { analyticsApi, ApiError } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../components/UI';
import { getStudioRole } from '../../../../utils/auth';
import { fmtMoneyCompact, fmtInt } from '../../../../lib/format';
import type { MetricConfig, MetricId, MyKpi, PeriodSummary } from '../types';
import { METRIC_PRESENTERS, MY_METRIC_PRESENTERS } from '../constants';

/** Сборщик метрик: валюта студии, без прочерков (0 по умолчанию), тренд — сырым числом. */
function buildMetrics(s: PeriodSummary | null, symbol: string, t: TFunction): MetricConfig[] {
  const cell: Record<string, { value: string; changePct: number | null }> = {
    revenue:   { value: fmtMoneyCompact(s?.revenue ?? 0, symbol), changePct: s?.trends.revenue_pct        ?? null },
    clients:   { value: fmtInt(s?.active_clients ?? 0),           changePct: s?.trends.active_clients_pct ?? null },
    bookings:  { value: fmtInt(s?.bookings ?? 0),                 changePct: s?.trends.bookings_pct       ?? null },
    retention: { value: `${Math.round(s?.retention ?? 0)}%`,      changePct: s?.trends.retention_pct      ?? null },
  };
  return METRIC_PRESENTERS.map(p => ({ ...p, ...cell[p.id], title: t(`metrics.${p.id}`) }));
}

/** Личные метрики (админ/тренер): rating — «4.8» либо прочерк, fill_rate — проценты. */
function buildMyMetrics(kpi: MyKpi[], t: TFunction): MetricConfig[] {
  return kpi.map(m => ({
    id: m.id,
    ...MY_METRIC_PRESENTERS[m.id],
    title: t(`metrics.${m.id}`),
    value: m.id === 'rating'
      ? (m.value > 0 ? m.value.toFixed(1) : '—')
      : m.id === 'fill_rate' ? `${Math.round(m.value)}%` : fmtInt(m.value),
    // Тренд рейтинга в процентах читается как чушь («+4%» к оценке) — прячем.
    changePct: m.id === 'rating' ? null : m.prev_pct,
  }));
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

/** Метрики Обзора → метрика /series ('retention' ряда не имеет).
 *  Только owner-ряд: график рисуется исключительно ему, у личных метрик рядов нет. */
const SERIES_METRIC: Partial<Record<MetricId, 'revenue' | 'new_clients' | 'bookings' | null>> = {
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
  const role = getStudioRole();
  const isOwner = role === 'owner';
  // ── UI-состояние ──
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [activeMetric, setActiveMetric] = useState<MetricId>('revenue');
  const currencySymbol = getCurrencySymbol(useStudioCurrency());

  // Диапазоны считаем один раз за рендер — они же входят в ключи кэша.
  const range = monthRange();
  const now = new Date();
  const { days, group } = seriesRange(now)[period];
  const seriesMetric = SERIES_METRIC[activeMetric] ?? null; // null для retention и личных метрик
  const seriesFrom = iso(new Date(now.getTime() - days * 86_400_000));
  const seriesTo = iso(now);

  // ── Серверные данные ──
  // Пять срезов ниже — owner-only на сервере. Без `enabled` админ и тренер при
  // каждом заходе на Дашборд огребали пачку 403 просто чтобы узнать то, что уже
  // написано у них в токене.
  const summary = useQuery({
    queryKey: queryKeys.overviewSummary(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getSummary(range),
    enabled: isOwner,
    staleTime: STALE,
  });

  const trainers = useQuery({
    queryKey: queryKeys.overviewTrainers(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getTrainers(range),
    enabled: isOwner,
    staleTime: STALE,
  });

  const services = useQuery({
    queryKey: queryKeys.overviewServices(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getServices(range),
    enabled: isOwner,
    staleTime: STALE,
  });

  const activity = useQuery({
    queryKey: queryKeys.overviewActivity,
    queryFn: () => analyticsApi.getActivityLog(13),
    enabled: isOwner,
    refetchInterval: 60_000, // лента «живая» — как сетка Журнала
  });

  // Дашборд админа и тренера: тот же месяц, но в охвате их роли.
  const my = useQuery({
    queryKey: queryKeys.overviewMy(range.date_from, range.date_to),
    queryFn: () => analyticsApi.getMySummary(range),
    enabled: !isOwner,
    staleTime: STALE,
  });

  const series = useQuery({
    queryKey: queryKeys.overviewSeries(seriesMetric ?? 'none', group, seriesFrom, seriesTo),
    queryFn: () => analyticsApi.getSeries({ metric: seriesMetric!, group, date_from: seriesFrom, date_to: seriesTo }),
    enabled: isOwner && seriesMetric !== null, // у retention ряда нет — запрос не шлём
    placeholderData: keepPreviousData, // смена метрики/периода не гасит график
    staleTime: STALE,
  });

  // ── Производные ──
  // Общего «Загрузка данных…» на всю страницу больше нет: каркас рисуется сразу,
  // каждый блок ждёт только свой запрос. Иначе метрики (уже пришедшие) не видно,
  // пока грузятся тренеры/услуги/лента — а они вообще ниже первого экрана.
  // Активные запросы зависят от роли: у неотправленного запроса isPending живёт
  // вечно, и попади он в этот список — страница ждала бы его до конца времён.
  const queries = isOwner ? [summary, trainers, services, activity] : [my];
  // Роль из токена могли понизить на сервере уже после его выдачи — 403 всё
  // равно ловим, иначе экран завис бы на «загружаем».
  const forbidden = queries.some(q => q.error instanceof ApiError && q.error.status === 403);

  // Первая загрузка «с нуля» (кэша ни у одного из запросов ещё нет) vs
  // фоновая: forbidden — это «нет доступа», не ошибка сети, из loadError исключён.
  const isFirstLoad = queries.some(q => q.isPending) && !forbidden;
  const loadError = forbidden ? null : (queries.find(q => q.error)?.error ?? null);
  const isFirstLoadError = isFirstLoad && loadError != null;
  const refetchAll = () => queries.forEach(q => q.refetch());

  const metrics: MetricConfig[] = useMemo(
    () => isOwner
      ? buildMetrics(summary.data ?? null, currencySymbol, t)
      : buildMyMetrics(my.data?.kpi ?? [], t),
    [isOwner, summary.data, my.data, currencySymbol, t],
  );

  // find может не найти: у админа и тренера активной по умолчанию 'revenue' в
  // ряду нет вовсе. Пустой activeConfig роняет график, поэтому падаем в первую.
  const activeConfig = metrics.find(m => m.id === activeMetric) ?? metrics[0];

  return {
    role, isOwner, forbidden,
    isFirstLoadError, loadError, refetchAll,
    summaryLoading: (isOwner ? summary.isPending : my.isPending) && !forbidden,
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
