import type { StudioTask, ActivityLog } from '../../../api/analytics/analytics.types';
export type { StudioTask, ActivityLog };

export type Task = StudioTask;
export type RecentEvent = ActivityLog;

export interface MetricConfig {
  id: string;
  title: string;
  value: string;
  change: string;
  color: string;
  glow: string;
  route: string;
  formatTooltip: (v: number) => string;
}
