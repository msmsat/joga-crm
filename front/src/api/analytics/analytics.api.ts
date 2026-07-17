import { client } from '../client'
import type {
  ActivityLog,
  PeriodSummary,
  SeriesPoint,
  ServiceReportRow,
  StudioReview,
  StudioTask,
  StudioTaskCreate,
  StudioTaskUpdate,
  TrainerReportRow,
} from './analytics.types'

type DateRange = { date_from: string; date_to: string }
type SeriesParams = DateRange & {
  metric: 'revenue' | 'expenses' | 'bookings' | 'new_clients'
  group?: 'day' | 'week' | 'month'
}

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString()

export const analyticsApi = {
  getSummary: (params: DateRange) =>
    client.get<PeriodSummary>(`/analytics/summary?${qs(params)}`),

  getSeries: ({ group = 'day', ...rest }: SeriesParams) =>
    client.get<SeriesPoint[]>(`/analytics/series?${qs({ group, ...rest })}`),

  getTrainers: (params: DateRange) =>
    client.get<TrainerReportRow[]>(`/analytics/trainers?${qs(params)}`),

  getServices: (params: DateRange) =>
    client.get<ServiceReportRow[]>(`/analytics/services?${qs(params)}`),

  getReviews: () =>
    client.get<StudioReview[]>('/analytics/reviews'),

  getActivityLog: (limit = 20) =>
    client.get<ActivityLog[]>(`/analytics/activity?limit=${limit}`),

  getTasks: () =>
    client.get<StudioTask[]>('/analytics/tasks'),

  createTask: (payload: StudioTaskCreate) =>
    client.post<StudioTask>('/analytics/tasks', payload),

  updateTask: (id: number, payload: StudioTaskUpdate) =>
    client.patch<StudioTask>(`/analytics/tasks/${id}`, payload),

  deleteTask: (id: number) =>
    client.delete<void>(`/analytics/tasks/${id}`),
}
