import { client } from '../client'
import type {
  StaffScheduleBlock, EligibleClient, Hall, Lesson, LessonCreate, LessonDaysResponse, LessonDetail, Reservation,
  ReservationPaymentOptions, ReservationPaymentPreview,
} from './schedule.types'

export const scheduleApi = {
  getStaffBlocks: (dateFrom: string, dateTo: string) =>
    client.get<StaffScheduleBlock[]>(`/schedule/staff-blocks?date_from=${dateFrom}&date_to=${dateTo}`),

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

  getLessonDays: (month: string, excludeTeacherIds: number[] = []) =>
    client.get<LessonDaysResponse>(
      `/schedule/lessons/days?month=${month}` +
      excludeTeacherIds.map(id => `&exclude_teacher_id=${id}`).join(''),
    ),

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

  // Пришёл / не пришёл. Деньги следуют за отметкой сами: «пришёл» после
  // занятия проводит долг наличными, «не пришёл» откатывает автозачисление.
  setAttendance: (id: number, attended: boolean) =>
    client.patch<Reservation>(`/schedule/reservations/${id}/attendance`, { attended }),

  // Одобрить бронь, ждущую подтверждения (настройка «Подтверждение тренером»
  // в Онлайн-записи). Отклонение — обычный cancelReservation.
  confirmReservation: (id: number) =>
    client.patch<Reservation>(`/schedule/reservations/${id}/confirm`, {}),

  // Клиент заплатил за занятие на месте: гасит долг и проводит доход через
  // кассовый движок. Карты здесь нет — эквайринг идёт через Stripe (бэк её и
  // не примет).
  // Скидка администратора, баллы и депозит считает сервер; `expected_total` —
  // итог, названный клиенту: разошёлся с пересчётом — 409, денег не приняли.
  payReservation: (id: number, paymentMethod: 'cash' | 'transfer',
                   options: ReservationPaymentOptions & { expected_total?: number } = {}) =>
    client.post<Reservation>(`/schedule/reservations/${id}/pay`, { payment_method: paymentMethod, ...options }),

  // Чек погашения долга — только чтение, ничего не списывает.
  reservationPaymentPreview: (id: number, options: ReservationPaymentOptions) =>
    client.post<ReservationPaymentPreview>(`/schedule/reservations/${id}/payment-preview`, options),
}
