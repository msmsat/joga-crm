import { client } from '../client'
import type { ContactCheckResponse, ContactField } from '../auth/auth.types'
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
  StaffDayOverrideItem,
  StaffTodayScheduleResponse,
  StaffCancelLessonResponse,
  StaffMessageResponse,
  StaffCallResponse,
} from './staff.types'

export const staffApi = {
  // ─── List & Profile ──────────────────────────────────────────────────────────

  getList: () =>
    client.get<StaffListResponse>('/staff/'),

  // Занят ли email/телефон другим аккаунтом продукта. excludeId — правимый сотрудник.
  checkContact: (field: ContactField, value: string, excludeId?: number) =>
    client.get<ContactCheckResponse>(
      `/staff/check-contact?field=${field}&value=${encodeURIComponent(value)}`
      + (excludeId !== undefined ? `&exclude_id=${excludeId}` : '')
    ),

  getProfile: (id: number) =>
    client.get<StaffProfile>(`/staff/${id}`),

  // ─── Mutations ───────────────────────────────────────────────────────────────

  create: (payload: StaffCreate) =>
    client.post<StaffMutateResponse>('/staff/', payload),

  update: (id: number, payload: StaffUpdate) =>
    client.put<StaffMutateResponse>(`/staff/${id}`, payload),

  delete: (id: number) =>
    client.delete<{ ok: boolean }>(`/staff/${id}`),

  // Отправить приглашение повторно — письмо не дошло или ссылка протухла.
  resendInvite: (id: number) =>
    client.post<StaffMutateResponse>(`/staff/${id}/invite`, {}),

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

  // is_working = null снимает отметку: день снова считается по недельному графику.
  setDayOverride: (id: number, date: string, is_working: boolean | null) =>
    client.put<StaffDayOverrideItem>(`/staff/${id}/schedule/day`, { date, is_working }),

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
