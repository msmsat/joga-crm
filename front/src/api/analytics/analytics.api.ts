import { client } from '../client'
import type { ActivityLog, DailyMetric, StudioReview, StudioTask, StudioTaskCreate } from './analytics.types'

export const analyticsApi = {
  getMetrics: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return client.get<DailyMetric[]>(`/analytics/metrics${q ? `?${q}` : ''}`)
  },

  getReviews: () =>
    client.get<StudioReview[]>('/analytics/reviews'),

  getActivityLog: () =>
    client.get<ActivityLog[]>('/analytics/activity'),

  getTasks: () =>
    client.get<StudioTask[]>('/analytics/tasks'),

  createTask: (payload: StudioTaskCreate) =>
    client.post<StudioTask>('/analytics/tasks', payload),

  updateTask: (id: number, payload: Partial<StudioTask>) =>
    client.patch<StudioTask>(`/analytics/tasks/${id}`, payload),

  deleteTask: (id: number) =>
    client.delete<void>(`/analytics/tasks/${id}`),
}
