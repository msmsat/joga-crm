import { useEffect, useMemo, useState } from 'react';
import { analyticsApi, ApiError } from '../../../../api';
import type {
  ActivityLog,
  MetricConfig,
  PeriodSummary,
  SeriesPoint,
  ServiceReportRow,
  StudioTask,
  TrainerReportRow,
} from '../types';
import { METRIC_PRESENTERS, formatMoney, formatTrend } from '../constants';

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
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [trainers, setTrainers] = useState<TrainerReportRow[]>([]);
  const [services, setServices] = useState<ServiceReportRow[]>([]);
  const [events, setEvents] = useState<ActivityLog[]>([]);
  const [tasks, setTasks] = useState<StudioTask[]>([]);
  const [loading, setLoading] = useState(true);
  /** true, если владелец-only эндпоинты вернули 403 (роль админ/тренер). */
  const [forbidden, setForbidden] = useState(false);

  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [activeMetric, setActiveMetric] = useState<MetricConfig['id']>('revenue');
  const [series, setSeries] = useState<SeriesPoint[]>([]);

  // Первичная загрузка: всё, кроме серии графика.
  useEffect(() => {
    let alive = true;
    const range = monthRange();
    (async () => {
      try {
        const [sum, tr, sv, ev, tk] = await Promise.all([
          analyticsApi.getSummary(range),
          analyticsApi.getTrainers(range),
          analyticsApi.getServices(range),
          analyticsApi.getActivityLog(13),
          analyticsApi.getTasks(),
        ]);
        if (!alive) return;
        setSummary(sum);
        setTrainers(tr);
        setServices(sv);
        setEvents(ev);
        setTasks(tk);
      } catch (e) {
        if (alive && e instanceof ApiError && e.status === 403) setForbidden(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Серия графика: зависит от выбранной метрики и периода.
  useEffect(() => {
    const metric = SERIES_METRIC[activeMetric];
    // retention ряда не имеет — график его не рисует (hasSeries), серию не трогаем.
    if (metric === null) return;
    let alive = true;
    const { days, group } = SERIES_RANGE[period];
    const from = new Date(Date.now() - days * 86_400_000);
    (async () => {
      try {
        const pts = await analyticsApi.getSeries({ metric, group, date_from: iso(from), date_to: iso(new Date()) });
        if (alive) setSeries(pts);
      } catch {
        if (alive) setSeries([]);
      }
    })();
    return () => { alive = false; };
  }, [activeMetric, period]);

  const metrics: MetricConfig[] = useMemo(() => {
    const s = summary;
    const cell: Record<MetricConfig['id'], { value: string; change: string }> = {
      revenue:   { value: s ? formatMoney(s.revenue) : '—',        change: formatTrend(s?.trends.revenue_pct ?? null) },
      clients:   { value: s ? String(s.active_clients) : '—',      change: formatTrend(s?.trends.active_clients_pct ?? null) },
      bookings:  { value: s ? String(s.bookings) : '—',            change: formatTrend(s?.trends.bookings_pct ?? null) },
      retention: { value: s ? `${Math.round(s.retention)}%` : '—', change: formatTrend(s?.trends.retention_pct ?? null) },
    };
    return METRIC_PRESENTERS.map(p => ({ ...p, ...cell[p.id] }));
  }, [summary]);

  const activeConfig = metrics.find(m => m.id === activeMetric)!;

  return {
    loading, forbidden,
    summary,
    metrics, activeMetric, setActiveMetric, activeConfig,
    period, setPeriod, series,
    trainers, services, events,
    tasks, setTasks,
  };
}
