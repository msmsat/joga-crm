import { client } from '../client'
import type { Hall, Lesson, LessonCreate, LessonDetail, Reservation } from './schedule.types'

export const scheduleApi = {
  getLessons: (params: { date_from: string; date_to: string; hall_id?: number }) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ).toString()
    return client.get<Lesson[]>(`/schedule/lessons?${q}`)
  },

  getLesson: (id: number) =>
    client.get<LessonDetail>(`/schedule/lessons/${id}`),

  createLesson: (payload: LessonCreate) =>
    client.post<Lesson>('/schedule/lessons', payload),

  updateLesson: (id: number, payload: Partial<LessonCreate>) =>
    client.patch<Lesson>(`/schedule/lessons/${id}`, payload),

  cancelLesson: (id: number) =>
    client.patch<void>(`/schedule/lessons/${id}/cancel`, {}),

  getHalls: () =>
    client.get<Hall[]>('/schedule/halls'),

  createHall: (payload: Omit<Hall, 'id'>) =>
    client.post<Hall>('/schedule/halls', payload),

  updateHall: (id: number, payload: Partial<Omit<Hall, 'id'>>) =>
    client.patch<Hall>(`/schedule/halls/${id}`, payload),

  createReservation: (clientId: number, lessonId: number) =>
    client.post<Reservation>('/schedule/reservations', { client_id: clientId, lesson_id: lessonId }),

  cancelReservation: (id: number) =>
    client.patch<Reservation>(`/schedule/reservations/${id}/cancel`, {}),

  attendReservation: (id: number) =>
    client.patch<Reservation>(`/schedule/reservations/${id}/attend`, {}),
}
