import type {
  ActivityLog,
  PeriodSummary,
  SeriesPoint,
  ServiceReportRow,
  StudioTask,
  TrainerReportRow,
} from '../../../api/analytics';

export type { ActivityLog, PeriodSummary, SeriesPoint, ServiceReportRow, TrainerReportRow, StudioTask };

export type Task = StudioTask;
export type RecentEvent = ActivityLog;

/** Статическая презентация метрики (иконка, цвет, роут). Значение и тренд — из API. */
export interface MetricPresenter {
  id: 'revenue' | 'clients' | 'bookings' | 'retention';
  title: string;
  color: string;
  glow: string;
  route: string;
}

/** MetricPresenter + рассчитанные из summary value/change для карточки. */
export interface MetricConfig extends MetricPresenter {
  value: string;
  change: string;
}
