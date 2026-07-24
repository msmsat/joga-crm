import { client } from '../client'
import type {
  ActivityLog,
  ClientsReportRead,
  OverviewRead,
  PeriodSummary,
  SalesRead,
  SalesSeriesPoint,
  SegmentClientRow,
  SeriesPoint,
  ServiceReportRow,
  StudioReview,
  StudioTask,
  StudioTaskCreate,
  StudioTaskUpdate,
  SlotLessonRow,
  TeamRead,
  TrainerDetailRead,
  TrainerReportRow,
  UtilizationRead,
} from './analytics.types'
import type { ReportFiltersParams } from '../../pages/dashboard/Reports/types'

type DateRange = { date_from: string; date_to: string }
type SeriesParams = ReportFiltersParams & {
  metric: 'revenue' | 'expenses' | 'bookings' | 'new_clients' | 'profit' | 'attendance' | 'fill_rate'
  group?: 'hour' | 'day' | 'week' | 'month'
}
type SalesSeriesParams = ReportFiltersParams & { group?: 'hour' | 'day' | 'week' | 'month' }

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

  getClientsReport: (params: ReportFiltersParams) =>
    client.get<ClientsReportRead>(`/analytics/clients-report?${reportQs(params)}`),

  getClientsReportSegment: (key: string, params: ReportFiltersParams) =>
    client.get<SegmentClientRow[]>(`/analytics/clients-report/segment?key=${encodeURIComponent(key)}&${reportQs(params)}`),

  getClientsReportWeek: (period: string, kind: 'new' | 'returned') =>
    client.get<SegmentClientRow[]>(`/analytics/clients-report/week?period=${period}&kind=${kind}`),

  getTeam: (params: ReportFiltersParams) =>
    client.get<TeamRead>(`/analytics/team?${reportQs(params)}`),

  getTrainerDetail: (id: number, params: ReportFiltersParams) =>
    client.get<TrainerDetailRead>(`/analytics/team/${id}?${reportQs(params)}`),

  getUtilization: (params: ReportFiltersParams) =>
    client.get<UtilizationRead>(`/analytics/utilization?${reportQs(params)}`),

  getUtilizationSlot: (weekday: number, hour: number, params: ReportFiltersParams) =>
    client.get<SlotLessonRow[]>(`/analytics/utilization/slot?weekday=${weekday}&hour=${hour}&${reportQs(params)}`),

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
