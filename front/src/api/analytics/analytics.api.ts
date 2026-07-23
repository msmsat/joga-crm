import { client } from '../client'
import type {
  ActivityLog,
  OverviewRead,
  PeriodSummary,
  SalesRead,
  SalesSeriesPoint,
  SeriesPoint,
  ServiceReportRow,
  StudioReview,
  StudioTask,
  StudioTaskCreate,
  StudioTaskUpdate,
  TrainerReportRow,
} from './analytics.types'
import type { ReportFiltersParams } from '../../pages/dashboard/Reports/types'

type DateRange = { date_from: string; date_to: string }
type SeriesParams = ReportFiltersParams & {
  metric: 'revenue' | 'expenses' | 'bookings' | 'new_clients' | 'profit' | 'attendance' | 'fill_rate'
  group?: 'day' | 'week' | 'month'
}
type SalesSeriesParams = ReportFiltersParams & { group?: 'day' | 'week' }

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString()

// Отчёты (5 вкладок): ReportFilters → query string, пустые поля не шлём.
// Методы под конкретные вкладки добавляются по эпикам R1-R5. useQuery каждой
// вкладки: queryKey queryKeys.report(tab, paramsKey), placeholderData:
// keepPreviousData (staleTime/refetchOnWindowFocus уже дефолт queryClient.ts).
export const reportQs = (filters: ReportFiltersParams): string =>
  qs(Object.fromEntries(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  ))

export const analyticsApi = {
  getSummary: (params: DateRange) =>
    client.get<PeriodSummary>(`/analytics/summary?${qs(params)}`),

  getSeries: ({ group = 'day', ...rest }: SeriesParams) =>
    client.get<SeriesPoint[]>(`/analytics/series?${reportQs(rest)}&group=${group}`),

  getOverview: (params: ReportFiltersParams) =>
    client.get<OverviewRead>(`/analytics/overview?${reportQs(params)}`),

  getSales: (params: ReportFiltersParams) =>
    client.get<SalesRead>(`/analytics/sales?${reportQs(params)}`),

  getSalesSeries: ({ group = 'day', ...rest }: SalesSeriesParams) =>
    client.get<SalesSeriesPoint[]>(`/analytics/sales/series?${reportQs(rest)}&group=${group}`),

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
