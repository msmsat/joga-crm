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

/** Статическая презентация метрики (иконка, цвет, роут). Заголовок — из словаря, значение и тренд — из API. */
export interface MetricPresenter {
  id: 'revenue' | 'clients' | 'bookings' | 'retention';
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
