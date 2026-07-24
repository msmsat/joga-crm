import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReportFilters, ReportFiltersParams, ReportPeriod } from '../types';

const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** Диапазон дат периода, заканчивающийся сегодня (day/week/month/year). */
function rangeForPeriod(period: Exclude<ReportPeriod, 'custom'>): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (period === 'day') {
    // сегодня — from === to
  } else if (period === 'week') {
    from.setDate(from.getDate() - 6);
  } else if (period === 'month') {
    from.setDate(from.getDate() - 29);
  } else {
    from.setDate(from.getDate() - 364);
  }
  return { from: toIso(from), to: toIso(to) };
}

/** Ось X всегда читаемая: сутки — по часам, до 45 дней — по дням, дальше — недели. */
export function groupForRange(from: string, to: string): 'hour' | 'day' | 'week' {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (days < 1) return 'hour';
  return days <= 45 ? 'day' : 'week';
}

/** Прошлый период той же длины — идентично back/routers/analytics/_filters.py:prev_range. */
export function prevRange(dateFrom: string, dateTo: string): { from: string; to: string } {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const lengthMs = to.getTime() - from.getTime();
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo.getTime() - lengthMs);
  return { from: toIso(prevFrom), to: toIso(prevTo) };
}

/**
 * Состояние фильтров Отчётов — целиком в URL searchParams, чтобы ссылку можно
 * было шарить и все вкладки делили один стейт.
 */
export function useReportFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const period = (searchParams.get('period') as ReportPeriod | null) ?? 'month';
  const defaultRange = period === 'custom' ? { from: '', to: '' } : rangeForPeriod(period);
  const dateFrom = searchParams.get('date_from') || defaultRange.from;
  const dateTo = searchParams.get('date_to') || defaultRange.to;

  const filters: ReportFilters = useMemo(() => ({
    period,
    dateFrom,
    dateTo,
    branchId: searchParams.get('branch_id') ? Number(searchParams.get('branch_id')) : null,
    hallId: searchParams.get('hall_id') ? Number(searchParams.get('hall_id')) : null,
    trainerId: searchParams.get('trainer_id') ? Number(searchParams.get('trainer_id')) : null,
    serviceId: searchParams.get('service_id') ? Number(searchParams.get('service_id')) : null,
  }), [period, dateFrom, dateTo, searchParams]);

  const setPeriod = useCallback((p: ReportPeriod) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('period', p);
      if (p !== 'custom') {
        const r = rangeForPeriod(p);
        next.set('date_from', r.from);
        next.set('date_to', r.to);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setCustomRange = useCallback((from: string, to: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('period', 'custom');
      next.set('date_from', from);
      next.set('date_to', to);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilter = useCallback((key: 'branchId' | 'hallId' | 'trainerId' | 'serviceId', value: number | null) => {
    const paramKey = { branchId: 'branch_id', hallId: 'hall_id', trainerId: 'trainer_id', serviceId: 'service_id' }[key];
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value == null) next.delete(paramKey);
      else next.set(paramKey, String(value));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Query-параметры для API: пустые фильтры не отправляются.
  const params: ReportFiltersParams = useMemo(() => {
    const p: ReportFiltersParams = { date_from: filters.dateFrom, date_to: filters.dateTo };
    if (filters.branchId != null) p.branch_id = filters.branchId;
    if (filters.hallId != null) p.hall_id = filters.hallId;
    if (filters.trainerId != null) p.trainer_id = filters.trainerId;
    if (filters.serviceId != null) p.service_id = filters.serviceId;
    return p;
  }, [filters]);

  // Строка для Query-ключа — стабильный порядок полей.
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  const comparisonRange = useMemo(
    () => (filters.dateFrom && filters.dateTo ? prevRange(filters.dateFrom, filters.dateTo) : null),
    [filters.dateFrom, filters.dateTo],
  );

  return { filters, params, paramsKey, comparisonRange, setPeriod, setCustomRange, setFilter };
}
