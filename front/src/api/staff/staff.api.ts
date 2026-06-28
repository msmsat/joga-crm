import { client } from '../client'
import type {
  StaffCreate,
  StaffUpdate,
  StaffMessagePayload,
  StaffCallPayload,
  StaffListResponse,
  StaffProfile,
  StaffMutateResponse,
  StaffWeekScheduleResponse,
  StaffMonthScheduleResponse,
  StaffTodayScheduleResponse,
  StaffCancelLessonResponse,
  StaffMessageResponse,
  StaffCallResponse,
} from './staff.types'

export const staffApi = {
  // ─── List & Profile ──────────────────────────────────────────────────────────

  getList: () =>
    client.get<StaffListResponse>('/staff/'),

  getProfile: (id: number) =>
    client.get<StaffProfile>(`/staff/${id}`),

  // ─── Mutations ───────────────────────────────────────────────────────────────

  create: (payload: StaffCreate) =>
    client.post<StaffMutateResponse>('/staff/', payload),

  update: (id: number, payload: StaffUpdate) =>
    client.put<StaffMutateResponse>(`/staff/${id}`, payload),

  delete: (id: number) =>
    client.delete<{ ok: boolean }>(`/staff/${id}`),

  // ─── Schedule ────────────────────────────────────────────────────────────────

  getWeekSchedule: (id: number) =>
    client.get<StaffWeekScheduleResponse>(`/staff/${id}/schedule/week`),

  getMonthSchedule: (id: number, year?: number, month?: number) => {
    const params = new URLSearchParams()
    if (year !== undefined) params.set('year', String(year))
    if (month !== undefined) params.set('month', String(month))
    const qs = params.toString()
    return client.get<StaffMonthScheduleResponse>(
      `/staff/${id}/schedule/month${qs ? `?${qs}` : ''}`
    )
  },

  getTodaySchedule: (id: number) =>
    client.get<StaffTodayScheduleResponse>(`/staff/${id}/schedule/today`),

  cancelLesson: (staffId: number, lessonId: number) =>
    client.post<StaffCancelLessonResponse>(
      `/staff/${staffId}/schedule/${lessonId}/cancel`,
      {}
    ),

  // ─── Actions ─────────────────────────────────────────────────────────────────

  sendMessage: (id: number, payload: StaffMessagePayload) =>
    client.post<StaffMessageResponse>(`/staff/${id}/message`, payload),

  call: (id: number, payload: StaffCallPayload) =>
    client.post<StaffCallResponse>(`/staff/${id}/call`, payload),
}
