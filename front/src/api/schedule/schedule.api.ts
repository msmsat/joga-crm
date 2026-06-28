import { client } from '../client'
import type { Hall, Lesson, LessonCreate, Reservation } from './schedule.types'

export const scheduleApi = {
  getLessons: (params?: { date?: string; hall_id?: number }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return client.get<Lesson[]>(`/schedule/lessons${q ? `?${q}` : ''}`)
  },

  getLesson: (id: number) =>
    client.get<Lesson>(`/schedule/lessons/${id}`),

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

  createReservation: (lessonId: number) =>
    client.post<Reservation>('/schedule/reservations', { lesson_id: lessonId }),

  cancelReservation: (id: number, reason?: string) =>
    client.patch<void>(`/schedule/reservations/${id}/cancel`, { cancellation_reason: reason }),
}
