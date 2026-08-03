import type {
  ActivityLog,
  MyKpi,
  MyKpiId,
  PeriodSummary,
  SeriesPoint,
  ServiceReportRow,
  StudioTask,
  TrainerReportRow,
} from '../../../api/analytics';

export type { ActivityLog, MyKpi, MyKpiId, PeriodSummary, SeriesPoint, ServiceReportRow, TrainerReportRow, StudioTask };

export type Task = StudioTask;
export type RecentEvent = ActivityLog;

/** Метрики владельца (кликабельны — переключают график). */
export type OwnerMetricId = 'revenue' | 'clients' | 'bookings' | 'retention';

/** Владелец видит сводку студии, админ и тренер — свою (GET /analytics/me). */
export type MetricId = OwnerMetricId | MyKpiId;

/** Статическая презентация метрики (иконка, цвет, роут). Заголовок — из словаря, значение и тренд — из API. */
export interface MetricPresenter {
  id: MetricId;
  color: string;
  glow: string;
  route: string;
}

/** MetricPresenter + переведённый заголовок и рассчитанные из summary value/тренд для карточки. */
export interface MetricConfig extends MetricPresenter {
  title: string;
  value: string;
  changePct: number | null;
}
