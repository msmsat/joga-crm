import { client } from '../client'
import type { EligibleClient, Hall, Lesson, LessonCreate, LessonDaysResponse, LessonDetail, Reservation } from './schedule.types'

export const scheduleApi = {
  getLessons: (params: { date_from: string; date_to: string; hall_id?: number }) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ).toString()
    return client.get<Lesson[]>(`/schedule/lessons?${q}`)
  },

  getLesson: (id: number) =>
    client.get<LessonDetail>(`/schedule/lessons/${id}`),

  getEligibleClients: (lessonId: number) =>
    client.get<EligibleClient[]>(`/schedule/lessons/${lessonId}/eligible-clients`),

  getLessonDays: (month: string) =>
    client.get<LessonDaysResponse>(`/schedule/lessons/days?month=${month}`),

  createLesson: (payload: LessonCreate) =>
    client.post<Lesson>('/schedule/lessons', payload),

  updateLesson: (id: number, payload: Partial<LessonCreate>) =>
    client.patch<Lesson>(`/schedule/lessons/${id}`, payload),

  cancelLesson: (id: number, reason?: string) =>
    client.patch<void>(`/schedule/lessons/${id}/cancel`, reason ? { reason } : {}),

  // Настоящее удаление — только для undo только что созданного занятия (V4-3);
  // занятие с записанными клиентами сервер не удалит (409).
  deleteLesson: (id: number) =>
    client.delete<void>(`/schedule/lessons/${id}`),

  getHalls: () =>
    client.get<Hall[]>('/schedule/halls'),

  createReservation: (clientId: number, lessonId: number) =>
    client.post<Reservation>('/schedule/reservations', { client_id: clientId, lesson_id: lessonId }),

  cancelReservation: (id: number) =>
    client.patch<Reservation>(`/schedule/reservations/${id}/cancel`, {}),

  attendReservation: (id: number) =>
    client.patch<Reservation>(`/schedule/reservations/${id}/attend`, {}),
}
